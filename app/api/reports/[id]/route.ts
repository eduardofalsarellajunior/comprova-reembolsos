import { NextResponse } from "next/server";
import { createServerSupabase, getBearerToken } from "@/lib/server-auth";
import { isWorkspaceId, REPORT_CURRENCY } from "@/lib/report-validation";

export const runtime = "nodejs";

async function getContext(request: Request) {
  const token = getBearerToken(request);
  const supabase = createServerSupabase(token);
  if (!token || !supabase) return { supabase: null, user: null };
  const { data, error } = await supabase.auth.getUser(token);
  return { supabase, user: error ? null : data.user };
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { supabase, user } = await getContext(request);
  if (!supabase || !user) return NextResponse.json({ error: "Sessão inválida." }, { status: 401 });
  const { id } = await context.params;
  const { data, error } = await supabase.from("reports").select("*, report_expenses(expense_id, position)").eq("id", id).single();
  if (error || !data) return NextResponse.json({ error: "Relatório não encontrado." }, { status: 404 });
  return NextResponse.json({ report: data });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { supabase, user } = await getContext(request);
  if (!supabase || !user) return NextResponse.json({ error: "Sessão inválida." }, { status: 401 });
  const { id } = await context.params;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Dados do relatório inválidos." }, { status: 400 });
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const [from, to] of [["name", "name"], ["description", "description"], ["periodStart", "period_start"], ["periodEnd", "period_end"], ["projectId", "project_id"], ["paymentMethodId", "payment_method_id"], ["notes", "notes"]]) {
    if (from in body) update[to] = body[from];
  }
  if ("name" in update && (typeof update.name !== "string" || !update.name.trim())) return NextResponse.json({ error: "Informe o nome do relatório." }, { status: 400 });
  const { data: current } = await supabase.from("reports").select("period_start,period_end,status,currency,project_id,payment_method_id").eq("id", id).eq("owner_id", user.id).single();
  if (!current || !["draft", "rejected"].includes(current.status)) return NextResponse.json({ error: "O relatório não está aberto para edição." }, { status: 409 });
  if (current.currency !== REPORT_CURRENCY) return NextResponse.json({ error: "Relatórios históricos em outra moeda não são convertidos automaticamente." }, { status: 409 });
  if (!isWorkspaceId("project_id" in update ? update.project_id : current.project_id) || !isWorkspaceId("payment_method_id" in update ? update.payment_method_id : current.payment_method_id)) return NextResponse.json({ error: "Selecione projeto e forma de pagamento." }, { status: 400 });
  if (String(update.period_start ?? current.period_start ?? "") && String(update.period_end ?? current.period_end ?? "") && String(update.period_start ?? current.period_start) > String(update.period_end ?? current.period_end)) return NextResponse.json({ error: "A data inicial deve ser anterior à data final." }, { status: 400 });
  const { data, error } = await supabase.from("reports").update(update).eq("id", id).eq("owner_id", user.id).select().single();
  if (error?.code === "22023") return NextResponse.json({ error: "Selecione um projeto ativo vinculado à sua conta e uma forma de pagamento ativa." }, { status: 400 });
  if (error || !data) return NextResponse.json({ error: "Não foi possível atualizar o relatório. Verifique se ele ainda está sob sua edição." }, { status: 409 });
  await supabase.from("audit_events").insert({ actor_user_id: user.id, entity_type: "report", entity_id: id, action: "updated", metadata: { fields: Object.keys(update) } });
  return NextResponse.json({ report: data });
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const { supabase, user } = await getContext(request);
  if (!supabase || !user) return NextResponse.json({ error: "Sessão inválida." }, { status: 401 });
  const { id } = await context.params;
  const { data, error } = await supabase.from("reports").delete().eq("id", id).eq("owner_id", user.id).select("id");
  if (error || !data?.length) return NextResponse.json({ error: "Só rascunhos nunca enviados para aprovação podem ser excluídos." }, { status: 409 });
  await supabase.from("audit_events").insert({ actor_user_id: user.id, entity_type: "report", entity_id: id, action: "deleted", metadata: {} });
  return NextResponse.json({ ok: true });
}
