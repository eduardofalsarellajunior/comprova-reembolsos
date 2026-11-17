import { NextResponse } from "next/server";
import { createServerSupabase, getBearerToken } from "@/lib/server-auth";
import { hasExpenseFields, isWorkspaceId, REPORT_CURRENCY } from "@/lib/report-validation";

export const runtime = "nodejs";

async function getContext(request: Request) {
  const token = getBearerToken(request);
  const supabase = createServerSupabase(token);
  if (!token || !supabase) return { supabase: null, user: null };
  const { data, error } = await supabase.auth.getUser(token);
  return { supabase, user: error ? null : data.user };
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { supabase, user } = await getContext(request);
  if (!supabase || !user) return NextResponse.json({ error: "Sessão inválida." }, { status: 401 });
  const { id: reportId } = await context.params;
  const body = await request.json().catch(() => null) as { expenseIds?: string[] } | null;
  if (!Array.isArray(body?.expenseIds) || !body.expenseIds.length || body.expenseIds.length > 200 || !body.expenseIds.every(isWorkspaceId)) return NextResponse.json({ error: "Selecione de 1 a 200 despesas válidas." }, { status: 400 });
  const expenseIds = [...new Set(body.expenseIds)];
  const { data: report } = await supabase.from("reports").select("id,status,currency").eq("id", reportId).eq("owner_id", user.id).single();
  if (!report || !["draft", "rejected"].includes(report.status)) return NextResponse.json({ error: "O relatório não está aberto para edição." }, { status: 409 });
  const { data: expenses } = await supabase.from("expenses").select("id,user_id,amount,description,currency").in("id", expenseIds).eq("user_id", user.id);
  if (!expenses || expenses.length !== expenseIds.length) return NextResponse.json({ error: "Uma ou mais despesas não pertencem ao usuário atual." }, { status: 403 });
  if (report.currency !== REPORT_CURRENCY || !expenses.every(hasExpenseFields)) return NextResponse.json({ error: "Preencha descrição e valor positivo em reais em todas as despesas." }, { status: 400 });
  const { data: existing } = await supabase.from("report_expenses").select("expense_id").in("expense_id", expenseIds);
  if (existing?.length) return NextResponse.json({ error: "Uma ou mais despesas já estão vinculadas a um relatório.", expenseIds: existing.map((row: { expense_id: string }) => row.expense_id) }, { status: 409 });
  const { error } = await supabase.from("report_expenses").insert(expenseIds.map((expenseId, index) => ({ report_id: reportId, expense_id: expenseId, position: index })));
  if (error?.code === "22023") return NextResponse.json({ error: "Confira tipo de despesa, descrição e valor positivo em reais." }, { status: 400 });
  if (error) return NextResponse.json({ error: "Não foi possível vincular as despesas." }, { status: 500 });
  await supabase.from("audit_events").insert({ actor_user_id: user.id, entity_type: "report", entity_id: reportId, action: "expenses_attached", metadata: { count: expenseIds.length } });
  return NextResponse.json({ ok: true, count: expenseIds.length });
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const { supabase, user } = await getContext(request);
  if (!supabase || !user) return NextResponse.json({ error: "Sessão inválida." }, { status: 401 });
  const { id: reportId } = await context.params;
  const body = await request.json().catch(() => null) as { expenseId?: string } | null;
  if (!body?.expenseId) return NextResponse.json({ error: "Despesa não informada." }, { status: 400 });
  const { data, error } = await supabase.from("report_expenses").delete().eq("report_id", reportId).eq("expense_id", body.expenseId).select("expense_id");
  if (error || !data?.length) return NextResponse.json({ error: "Não foi possível retirar a despesa. Confira se o relatório ainda está aberto." }, { status: 409 });
  return NextResponse.json({ ok: true });
}
