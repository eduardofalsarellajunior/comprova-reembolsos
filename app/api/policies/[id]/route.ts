import { NextResponse } from "next/server";
import { createServerSupabase, getBearerToken } from "@/lib/server-auth";

export const runtime = "nodejs";

async function context(request: Request) {
  const token = getBearerToken(request);
  const supabase = createServerSupabase(token);
  if (!token || !supabase) return { supabase: null, user: null };
  const { data, error } = await supabase.auth.getUser(token);
  return { supabase, user: error ? null : data.user };
}

export async function PATCH(request: Request, routeContext: { params: Promise<{ id: string }> }) {
  const { supabase, user } = await context(request);
  if (!supabase || !user) return NextResponse.json({ error: "Sessão inválida." }, { status: 401 });
  const { id } = await routeContext.params;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body?.name === "string" && body.name.trim()) update.name = body.name.trim();
  if (typeof body?.category === "string") update.category = body.category.trim() || null;
  if ("active" in (body || {})) update.active = Boolean(body?.active);
  if ("requiresReceipt" in (body || {})) update.requires_receipt = body?.requiresReceipt !== false;
  if ("maxAmount" in (body || {})) update.max_amount = body?.maxAmount ? Number(body.maxAmount) : null;
  if ("maxDaysAfterExpense" in (body || {})) update.max_days_after_expense = body?.maxDaysAfterExpense ? Number(body.maxDaysAfterExpense) : null;
  const { data, error } = await supabase.from("policy_rules").update(update).eq("id", id).eq("owner_id", user.id).select().single();
  if (error || !data) return NextResponse.json({ error: "Não foi possível atualizar a regra." }, { status: 409 });
  return NextResponse.json({ policy: data });
}

export async function DELETE(request: Request, routeContext: { params: Promise<{ id: string }> }) {
  const { supabase, user } = await context(request);
  if (!supabase || !user) return NextResponse.json({ error: "Sessão inválida." }, { status: 401 });
  const { id } = await routeContext.params;
  const { error } = await supabase.from("policy_rules").delete().eq("id", id).eq("owner_id", user.id);
  if (error) return NextResponse.json({ error: "Não foi possível excluir a regra." }, { status: 409 });
  return NextResponse.json({ ok: true });
}
