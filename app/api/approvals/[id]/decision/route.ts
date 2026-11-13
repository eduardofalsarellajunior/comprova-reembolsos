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
  const body = await request.json().catch(() => null) as { decision?: string; reason?: string; attempt?: number; step?: number } | null;
  if (!body || !["approve", "reject"].includes(body.decision || "") || !Number.isInteger(body.attempt) || !Number.isInteger(body.step)) return NextResponse.json({ error: "Decisão inválida. Atualize a página e tente novamente." }, { status: 400 });
  const { data, error } = await supabase.rpc("decide_report", { p_instance_id: id, p_decision: body.decision, p_reason: typeof body.reason === "string" ? body.reason : "", p_attempt: body.attempt, p_step: body.step });
  if (error) return NextResponse.json({ error: error.message }, { status: 409 });
  return NextResponse.json(data);
}
