import { NextResponse } from "next/server";
import { createServerSupabase, getBearerToken } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const token = getBearerToken(request);
  const supabase = createServerSupabase(token);
  if (!token || !supabase) return NextResponse.json({ error: "Sessão inválida." }, { status: 401 });
  const { data: auth, error: authError } = await supabase.auth.getUser(token);
  if (authError || !auth.user) return NextResponse.json({ error: "Sessão inválida." }, { status: 401 });
  const body = await request.json().catch(() => null) as { name?: string; approverUserId?: string } | null;
  const approverUserId = body?.approverUserId || auth.user.id;
  const { data: flow, error } = await supabase.from("approval_flows").insert({ owner_id: auth.user.id, name: body?.name?.trim() || "Aprovação padrão", active: true }).select().single();
  if (error || !flow) return NextResponse.json({ error: "Não foi possível criar o fluxo." }, { status: 500 });
  const { error: stepError } = await supabase.from("approval_steps").insert({ flow_id: flow.id, step_order: 1, approver_user_id: approverUserId });
  if (stepError) return NextResponse.json({ error: "Fluxo criado, mas o aprovador não pôde ser configurado." }, { status: 500 });
  return NextResponse.json({ flow }, { status: 201 });
}
