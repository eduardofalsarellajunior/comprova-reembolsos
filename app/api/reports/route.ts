import { NextResponse } from "next/server";
import { createServerSupabase, getBearerToken } from "@/lib/server-auth";

export const runtime = "nodejs";

async function authenticated(request: Request) {
  const token = getBearerToken(request);
  const supabase = createServerSupabase(token);
  if (!token || !supabase) return { token, supabase: null, user: null };
  const { data, error } = await supabase.auth.getUser(token);
  return { token, supabase, user: error ? null : data.user };
}

export async function GET(request: Request) {
  const { supabase, user } = await authenticated(request);
  if (!supabase || !user) return NextResponse.json({ error: "Sessão inválida." }, { status: 401 });
  const { data, error } = await supabase.from("reports").select("*, report_expenses(expense_id, position)").order("updated_at", { ascending: false });
  if (error) return NextResponse.json({ error: "Não foi possível carregar os relatórios." }, { status: 500 });
  return NextResponse.json({ reports: data || [] });
}

export async function POST(request: Request) {
  const { supabase, user } = await authenticated(request);
  if (!supabase || !user) return NextResponse.json({ error: "Sessão inválida." }, { status: 401 });
  const body = await request.json().catch(() => null) as { name?: string; description?: string; periodStart?: string; periodEnd?: string } | null;
  const name = body?.name?.trim();
  if (!name) return NextResponse.json({ error: "Informe o nome do relatório." }, { status: 400 });
  const { data, error } = await supabase.from("reports").insert({ owner_id: user.id, name, description: body?.description?.trim() || "", period_start: body?.periodStart || null, period_end: body?.periodEnd || null }).select().single();
  if (error || !data) return NextResponse.json({ error: "Não foi possível criar o relatório." }, { status: 500 });
  await supabase.from("audit_events").insert({ actor_user_id: user.id, entity_type: "report", entity_id: data.id, action: "created", metadata: { name } });
  return NextResponse.json({ report: data }, { status: 201 });
}
