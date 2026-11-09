import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { buildContaAzulAuthorizationUrl, contaAzulConfigured } from "@/lib/conta-azul";
import { createServerSupabase, getBearerToken } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const token = getBearerToken(request);
  const supabase = createServerSupabase(token);
  if (!token || !supabase) return NextResponse.json({ error: "Sessão inválida." }, { status: 401 });
  const { data: auth, error: authError } = await supabase.auth.getUser(token);
  if (authError || !auth.user) return NextResponse.json({ error: "Sessão inválida." }, { status: 401 });
  if (!contaAzulConfigured()) return NextResponse.json({ error: "A integração Conta Azul ainda não foi configurada no servidor." }, { status: 503 });
  const state = randomBytes(32).toString("base64url");
  const stateHash = createHash("sha256").update(state).digest("hex");
  const expires = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  const { error } = await supabase.from("integration_connections").insert({ owner_id: auth.user.id, provider: "conta_azul", status: "pending", oauth_state_hash: stateHash, oauth_state_expires_at: expires });
  if (error) return NextResponse.json({ error: "Não foi possível iniciar a conexão Conta Azul." }, { status: 500 });
  const response = NextResponse.json({ authorizationUrl: buildContaAzulAuthorizationUrl(state) });
  response.cookies.set("comprova_conta_azul_state", state, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: 600, path: "/" });
  return response;
}
