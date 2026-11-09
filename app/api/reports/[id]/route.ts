import { NextResponse } from "next/server";
import { createServerSupabase, getBearerToken } from "@/lib/server-auth";

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
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const [from, to] of [["name", "name"], ["description", "description"], ["periodStart", "period_start"], ["periodEnd", "period_end"], ["status", "status"], ["rejectionReason", "rejection_reason"]]) {
    if (body && from in body) update[to] = body[from];
  }
  const { data, error } = await supabase.from("reports").update(update).eq("id", id).eq("owner_id", user.id).select().single();
  if (error || !data) return NextResponse.json({ error: "Não foi possível atualizar o relatório. Verifique se ele ainda está sob sua edição." }, { status: 409 });
  await supabase.from("audit_events").insert({ actor_user_id: user.id, entity_type: "report", entity_id: id, action: "updated", metadata: { fields: Object.keys(update) } });
  return NextResponse.json({ report: data });
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const { supabase, user } = await getContext(request);
  if (!supabase || !user) return NextResponse.json({ error: "Sessão inválida." }, { status: 401 });
  const { id } = await context.params;
  const { error } = await supabase.from("reports").delete().eq("id", id).eq("owner_id", user.id);
  if (error) return NextResponse.json({ error: "Só relatórios em rascunho, rejeitados ou cancelados podem ser excluídos." }, { status: 409 });
  await supabase.from("audit_events").insert({ actor_user_id: user.id, entity_type: "report", entity_id: id, action: "deleted", metadata: {} });
  return NextResponse.json({ ok: true });
}
