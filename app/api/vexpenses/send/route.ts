import { NextResponse } from "next/server";
import { createServerSupabase, getBearerToken } from "@/lib/server-auth";
import { asRecord, dataItems, getExpenseTypes, getMemberByEmail, getReport, getReports, vexpensesFetch, VexpensesApiError } from "@/lib/vexpenses";

export const runtime = "nodejs";

type SendBody = { expenseId?: string; reportId?: number; expenseTypeId?: number };

export async function POST(request: Request) {
  const token = getBearerToken(request);
  const supabase = createServerSupabase(token);
  if (!token) return NextResponse.json({ error: "Sessão inválida." }, { status: 401 });
  if (!supabase) return NextResponse.json({ error: "O servidor ainda não foi configurado completamente." }, { status: 503 });
  const { data: authData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !authData.user?.email) return NextResponse.json({ error: "Sua sessão expirou. Entre novamente." }, { status: 401 });
  const body = await request.json().catch(() => null) as SendBody | null;
  const reportId = Number(body?.reportId);
  const expenseTypeId = Number(body?.expenseTypeId);
  if (!body?.expenseId || !reportId || !expenseTypeId) return NextResponse.json({ error: "Despesa, relatório e categoria são obrigatórios." }, { status: 400 });

  const { data: expense, error: expenseError } = await supabase.from("expenses").select("*, receipts!inner(storage_path, file_name, mime_type)").eq("id", body.expenseId).eq("user_id", authData.user.id).single();
  if (expenseError || !expense) return NextResponse.json({ error: "Despesa não encontrada." }, { status: 404 });
  if (expense.vexpenses_status === "sent") return NextResponse.json({ error: "Esta despesa já foi enviada para a VExpenses." }, { status: 409 });
  if (!expense.expense_date || expense.amount === null || Number(expense.amount) <= 0) return NextResponse.json({ error: "Confira a data e o valor antes de enviar." }, { status: 400 });

  await supabase.from("expenses").update({ vexpenses_status: "sending", vexpenses_error: null }).eq("id", expense.id);
  try {
    const member = await getMemberByEmail(authData.user.email);
    const [types, reports] = await Promise.all([getExpenseTypes(), getReports(member.id)]);
    if (!types.some((type) => type.id === expenseTypeId)) throw new VexpensesApiError("A categoria escolhida não está ativa na VExpenses.", 400);
    if (!reports.some((report) => report.id === reportId && ["ABERTO", "REABERTO"].includes(report.status))) throw new VexpensesApiError("O relatório escolhido não está aberto ou não pertence ao seu usuário.", 400);
    const report = await getReport(reportId);
    if (report.userId !== member.id || !["ABERTO", "REABERTO"].includes(report.status)) throw new VexpensesApiError("O relatório escolhido não está aberto ou não pertence ao seu usuário.", 400);
    const receipt = asRecord(expense.receipts);
    const storagePath = typeof receipt?.storage_path === "string" ? receipt.storage_path : "";
    const { data: signed, error: signedError } = await supabase.storage.from("receipts").createSignedUrl(storagePath, 86400);
    if (signedError || !signed?.signedUrl) throw new VexpensesApiError("Não foi possível preparar o comprovante para envio.");
    const title = String(expense.description || expense.supplier || expense.category || "Despesa").slice(0, 120);
    console.info("[vexpenses/send] submitting expense", {
      userId: member.id,
      reportId,
      expenseTypeId,
      paymentMethodId: report.paymentMethodId || null,
      payingCompanyId: report.payingCompanyId || member.companyId,
      date: expense.expense_date,
      value: Number(expense.amount),
      reimbursable: true,
    });
    const result = await vexpensesFetch("/expenses", { method: "POST", body: JSON.stringify({ user_id: member.id, external_id: expense.id, expense_type_id: expenseTypeId, ...(report.paymentMethodId ? { payment_method_id: report.paymentMethodId } : {}), paying_company_id: report.payingCompanyId || member.companyId, receipt_url: signed.signedUrl, reicept_url: signed.signedUrl, date: expense.expense_date, value: Number(expense.amount), report_id: reportId, title, validate: "S", observation: String(expense.notes || ""), reimbursable: true, original_currency_iso: expense.currency || "BRL" }) });
    const created = dataItems(result)[0] || asRecord(result);
    const createdId = Number(created?.id);
    const sentAt = new Date().toISOString();
    const { error: updateError } = await supabase.from("expenses").update({ vexpenses_status: "sent", vexpenses_expense_id: Number.isFinite(createdId) && createdId > 0 ? createdId : null, vexpenses_report_id: reportId, vexpenses_error: null, vexpenses_sent_at: sentAt }).eq("id", expense.id);
    if (updateError) throw new VexpensesApiError("A despesa foi enviada, mas o histórico local não pôde ser atualizado.");
    return NextResponse.json({ expenseId: Number.isFinite(createdId) ? createdId : null, reportId, sentAt });
  } catch (cause) {
    const error = cause instanceof VexpensesApiError ? cause : new VexpensesApiError("Não foi possível enviar a despesa para a VExpenses.");
    await supabase.from("expenses").update({ vexpenses_status: "error", vexpenses_error: error.message }).eq("id", expense.id);
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
}
