import { NextResponse } from "next/server";
import { createServerSupabase, getBearerToken } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const token = getBearerToken(request);
  const supabase = createServerSupabase(token);
  if (!token || !supabase) return NextResponse.json({ error: "Sessão inválida." }, { status: 401 });
  const { data: auth, error: authError } = await supabase.auth.getUser(token);
  if (authError || !auth.user) return NextResponse.json({ error: "Sessão inválida." }, { status: 401 });
  const { id } = await context.params;
  const { data: report, error: reportError } = await supabase.from("reports").select("*, report_expenses(expense_id)").eq("id", id).eq("owner_id", auth.user.id).single();
  if (reportError || !report) return NextResponse.json({ error: "Relatório não encontrado." }, { status: 404 });
  if (!['draft', 'rejected'].includes(report.status)) return NextResponse.json({ error: "Este relatório não está disponível para envio." }, { status: 409 });
  if (!report.report_expenses?.length) return NextResponse.json({ error: "Adicione pelo menos uma despesa ao relatório." }, { status: 400 });
  const { data: rules } = await supabase.from("policy_rules").select("id,name,category,max_amount,requires_receipt,max_days_after_expense").eq("owner_id", auth.user.id).eq("active", true);
  const expenseIds = report.report_expenses.map((item: { expense_id: string }) => item.expense_id);
  const { data: reportExpenses } = await supabase.from("expenses").select("id,category,amount,expense_date,receipt_id").in("id", expenseIds).eq("user_id", auth.user.id);
  const violations: Array<{ report_id: string; expense_id: string; rule_id: string; code: string; severity: "warning" | "blocking"; message: string }> = [];
  for (const expense of reportExpenses || []) {
    for (const rule of rules || []) {
      if (rule.category && rule.category !== expense.category) continue;
      if (rule.max_amount !== null && rule.max_amount !== undefined && expense.amount !== null && Number(expense.amount) > Number(rule.max_amount)) violations.push({ report_id: id, expense_id: expense.id, rule_id: rule.id, code: "MAX_AMOUNT", severity: "blocking", message: `${rule.name}: valor acima do limite.` });
      if (rule.requires_receipt && !expense.receipt_id) violations.push({ report_id: id, expense_id: expense.id, rule_id: rule.id, code: "RECEIPT_REQUIRED", severity: "blocking", message: `${rule.name}: comprovante obrigatório.` });
      if (rule.max_days_after_expense !== null && rule.max_days_after_expense !== undefined && expense.expense_date) {
        const days = Math.floor((Date.now() - new Date(`${expense.expense_date}T00:00:00Z`).getTime()) / 86400000);
        if (days > Number(rule.max_days_after_expense)) violations.push({ report_id: id, expense_id: expense.id, rule_id: rule.id, code: "DATE_WINDOW", severity: "warning", message: `${rule.name}: despesa fora do prazo configurado.` });
      }
    }
  }
  await supabase.from("policy_violations").delete().eq("report_id", id).is("resolved_at", null);
  if (violations.length) await supabase.from("policy_violations").insert(violations);
  const { data: blocking } = await supabase.from("policy_violations").select("id, message").eq("report_id", id).eq("severity", "blocking").is("resolved_at", null);
  if (blocking?.length) return NextResponse.json({ error: "Há violações bloqueantes de política.", violations: blocking }, { status: 409 });
  const { data: flow } = await supabase.from("approval_flows").select("id").eq("owner_id", auth.user.id).eq("active", true).order("created_at", { ascending: true }).limit(1).maybeSingle();
  if (!flow) return NextResponse.json({ error: "Configure pelo menos um fluxo de aprovação antes de enviar." }, { status: 409 });
  const { data: steps } = await supabase.from("approval_steps").select("step_order").eq("flow_id", flow.id).order("step_order", { ascending: true });
  if (!steps?.length) return NextResponse.json({ error: "O fluxo de aprovação não possui aprovadores." }, { status: 409 });
  const { error: updateError } = await supabase.from("reports").update({ status: "submitted", submitted_at: new Date().toISOString(), rejection_reason: null, updated_at: new Date().toISOString() }).eq("id", id).eq("owner_id", auth.user.id);
  if (updateError) return NextResponse.json({ error: "Não foi possível enviar o relatório." }, { status: 500 });
  const { error: approvalError } = await supabase.from("approval_instances").upsert({ report_id: id, flow_id: flow.id, current_step: steps[0].step_order, status: "pending", updated_at: new Date().toISOString() }, { onConflict: "report_id" });
  if (approvalError) return NextResponse.json({ error: "O relatório foi enviado, mas a aprovação não pôde ser criada." }, { status: 500 });
  await supabase.from("audit_events").insert({ actor_user_id: auth.user.id, entity_type: "report", entity_id: id, action: "submitted", metadata: { flow_id: flow.id } });
  return NextResponse.json({ ok: true, status: "submitted" });
}
