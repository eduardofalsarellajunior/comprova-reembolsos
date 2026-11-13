import { NextResponse } from "next/server";
import { createServerSupabase, getBearerToken } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const token = getBearerToken(request);
  const supabase = createServerSupabase(token);
  if (!token || !supabase) return NextResponse.json({ error: "Sessão inválida." }, { status: 401 });
  const { data: auth, error: authError } = await supabase.auth.getUser(token);
  if (authError || !auth.user) return NextResponse.json({ error: "Sessão inválida." }, { status: 401 });
  const companyId = new URL(request.url).searchParams.get("companyId");
  if (!companyId) return NextResponse.json({ error: "Empresa não informada." }, { status: 400 });
  const { data, error } = await supabase.from("approval_flows").select("*, approval_steps(id,step_order,approver_user_id)").eq("company_id", companyId).order("created_at");
  if (error) return NextResponse.json({ error: "Não foi possível carregar os fluxos." }, { status: 500 });
  return NextResponse.json({ flows: data || [] });
}

export async function POST(request: Request) {
  const token = getBearerToken(request);
  const supabase = createServerSupabase(token);
  if (!token || !supabase) return NextResponse.json({ error: "Sessão inválida." }, { status: 401 });
  const { data: auth, error: authError } = await supabase.auth.getUser(token);
  if (authError || !auth.user) return NextResponse.json({ error: "Sessão inválida." }, { status: 401 });
  const body = await request.json().catch(() => null) as { name?: string; companyId?: string; approverUserIds?: string[] } | null;
  if (!body?.companyId || !body.name?.trim() || !body.approverUserIds?.length) return NextResponse.json({ error: "Informe empresa, nome e aprovadores." }, { status: 400 });
  const { data, error } = await supabase.rpc("create_approval_flow", { p_company_id: body.companyId, p_name: body.name.trim(), p_approvers: body.approverUserIds });
  if (error || !data) return NextResponse.json({ error: error?.message || "Não foi possível criar o fluxo." }, { status: 409 });
  return NextResponse.json({ flowId: data }, { status: 201 });
}
