import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { exchangeContaAzulCode } from "@/lib/conta-azul";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { encryptSecret } from "@/lib/secret-crypto";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const errorDescription = url.searchParams.get("error_description");
  if (!code || !state) return NextResponse.redirect(new URL(`/?conta_azul=error&message=${encodeURIComponent(errorDescription || "Autorização incompleta.")}`, request.url));
  const admin = createAdminSupabase();
  if (!admin) return NextResponse.redirect(new URL("/?conta_azul=error&message=Integração do servidor ainda não configurada.", request.url));
  const stateHash = createHash("sha256").update(state).digest("hex");
  const { data: connection } = await admin.from("integration_connections").select("id,owner_id,oauth_state_expires_at").eq("oauth_state_hash", stateHash).eq("status", "pending").single();
  if (!connection || !connection.oauth_state_expires_at || new Date(connection.oauth_state_expires_at).getTime() < Date.now()) return NextResponse.redirect(new URL("/?conta_azul=error&message=Estado de autorização expirado.", request.url));
  try {
    const tokens = await exchangeContaAzulCode(code);
    const { error } = await admin.from("integration_connections").update({ status: "connected", access_token_ciphertext: encryptSecret(tokens.access_token), refresh_token_ciphertext: tokens.refresh_token ? encryptSecret(tokens.refresh_token) : null, token_expires_at: new Date(Date.now() + Number(tokens.expires_in || 3600) * 1000).toISOString(), oauth_state_hash: null, oauth_state_expires_at: null, updated_at: new Date().toISOString() }).eq("id", connection.id);
    if (error) throw new Error("Não foi possível guardar a conexão.");
    return NextResponse.redirect(new URL("/relatorios?conta_azul=connected", request.url));
  } catch (error) {
    await admin.from("integration_connections").update({ status: "error", last_error: error instanceof Error ? error.message : "Falha na autorização.", oauth_state_hash: null, oauth_state_expires_at: null, updated_at: new Date().toISOString() }).eq("id", connection.id);
    return NextResponse.redirect(new URL(`/?conta_azul=error&message=${encodeURIComponent(error instanceof Error ? error.message : "Falha na autorização.")}`, request.url));
  }
}
