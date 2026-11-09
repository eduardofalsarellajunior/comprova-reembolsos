import { NextResponse } from "next/server";
import { createServerSupabase, getBearerToken } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const token = getBearerToken(request);
  const supabase = createServerSupabase(token);
  if (!token || !supabase) return NextResponse.json({ error: "Sessão inválida." }, { status: 401 });
  const { data: auth, error: authError } = await supabase.auth.getUser(token);
  if (authError || !auth.user) return NextResponse.json({ error: "Sessão inválida." }, { status: 401 });
  const { data: connection, error } = await supabase.from("integration_connections")
    .select("id,provider,company_name,external_company_id,status,token_expires_at,last_sync_at,last_error,created_at,updated_at")
    .eq("owner_id", auth.user.id).eq("provider", "conta_azul").order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) return NextResponse.json({ error: "Não foi possível carregar o estado da Conta Azul." }, { status: 500 });
  if (!connection) return NextResponse.json({ connection: null, mappings: [] });
  const { data: mappings } = await supabase.from("accounting_mappings")
    .select("id,mapping_kind,local_key,local_label,external_id,external_label,active")
    .eq("connection_id", connection.id).order("mapping_kind", { ascending: true }).order("local_key", { ascending: true });
  return NextResponse.json({ connection, mappings: mappings || [] });
}
