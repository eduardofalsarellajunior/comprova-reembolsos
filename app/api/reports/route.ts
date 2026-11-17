import { NextResponse } from "next/server";
import { createServerSupabase, getBearerToken } from "@/lib/server-auth";
import { isWorkspaceId, REPORT_CURRENCY } from "@/lib/report-validation";

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
  const { data, error } = await supabase.from("reports").select("*, report_expenses(expense_id, position), projects(name), payment_methods(name)").order("updated_at", { ascending: false });
  if (error) return NextResponse.json({ error: "Não foi possível carregar os relatórios." }, { status: 500 });
  return NextResponse.json({ reports: data || [] });
}

export async function POST(request: Request) {
  const { supabase, user } = await authenticated(request);
  if (!supabase || !user) return NextResponse.json({ error: "Sessão inválida." }, { status: 401 });
  const body = await request.json().catch(() => null) as { name?: unknown; description?: unknown; periodStart?: string; periodEnd?: string; companyId?: string; projectId?: string; paymentMethodId?: string; notes?: unknown } | null;
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "Informe o nome do relatório." }, { status: 400 });
  if (!isWorkspaceId(body?.companyId)) return NextResponse.json({ error: "Selecione a empresa." }, { status: 400 });
  if (!isWorkspaceId(body.projectId) || !isWorkspaceId(body.paymentMethodId)) return NextResponse.json({ error: "Selecione projeto e forma de pagamento." }, { status: 400 });
  if (body.periodStart && body.periodEnd && body.periodStart > body.periodEnd) return NextResponse.json({ error: "A data inicial deve ser anterior à data final." }, { status: 400 });
  const { data: company } = await supabase.from("companies").select("id").eq("id", body.companyId).single();
  if (!company) return NextResponse.json({ error: "Empresa não encontrada." }, { status: 404 });
  const { data, error } = await supabase.from("reports").insert({ owner_id: user.id, company_id: body.companyId, name, description: typeof body.description === "string" ? body.description.trim() : "", currency: REPORT_CURRENCY, period_start: body.periodStart || null, period_end: body.periodEnd || null, project_id: body.projectId, payment_method_id: body.paymentMethodId, notes: typeof body.notes === "string" ? body.notes.trim() : "" }).select().single();
  if (error?.code === "22023") return NextResponse.json({ error: "Selecione um projeto ativo vinculado à sua conta e uma forma de pagamento ativa." }, { status: 400 });
  if (error || !data) return NextResponse.json({ error: "Não foi possível criar o relatório." }, { status: 500 });
  await supabase.from("audit_events").insert({ actor_user_id: user.id, entity_type: "report", entity_id: data.id, action: "created", metadata: { name } });
  return NextResponse.json({ report: data }, { status: 201 });
}
