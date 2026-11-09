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

export async function POST(request: Request) {
  const { supabase, user } = await context(request);
  if (!supabase || !user) return NextResponse.json({ error: "Sessão inválida." }, { status: 401 });
  const body = await request.json().catch(() => null) as { mappingKind?: string; localKey?: string; localLabel?: string; externalId?: string; externalLabel?: string; connectionId?: string } | null;
  if (!body?.mappingKind || !body.localKey?.trim() || !body.externalId?.trim()) return NextResponse.json({ error: "Informe tipo, chave local e identificador externo." }, { status: 400 });
  const { data: connection } = await supabase.from("integration_connections").select("id").eq("id", body.connectionId || "").eq("owner_id", user.id).eq("provider", "conta_azul").single();
  if (!connection) return NextResponse.json({ error: "Conexão Conta Azul não encontrada." }, { status: 404 });
  const { data, error } = await supabase.from("accounting_mappings").upsert({
    connection_id: connection.id,
    mapping_kind: body.mappingKind,
    local_key: body.localKey.trim(),
    local_label: body.localLabel?.trim() || body.localKey.trim(),
    external_id: body.externalId.trim(),
    external_label: body.externalLabel?.trim() || body.externalId.trim(),
    active: true,
    updated_at: new Date().toISOString(),
  }, { onConflict: "connection_id,mapping_kind,local_key" }).select().single();
  if (error || !data) return NextResponse.json({ error: "Não foi possível salvar o mapeamento. Confira o tipo informado." }, { status: 500 });
  return NextResponse.json({ mapping: data });
}

export async function DELETE(request: Request) {
  const { supabase, user } = await context(request);
  if (!supabase || !user) return NextResponse.json({ error: "Sessão inválida." }, { status: 401 });
  const body = await request.json().catch(() => null) as { id?: string } | null;
  if (!body?.id) return NextResponse.json({ error: "Mapeamento não informado." }, { status: 400 });
  const { data: mapping } = await supabase.from("accounting_mappings").select("id,connection_id").eq("id", body.id).single();
  if (!mapping) return NextResponse.json({ error: "Mapeamento não encontrado." }, { status: 404 });
  const { data: connection } = await supabase.from("integration_connections").select("id").eq("id", mapping.connection_id).eq("owner_id", user.id).single();
  if (!connection) return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
  const { error } = await supabase.from("accounting_mappings").delete().eq("id", body.id);
  if (error) return NextResponse.json({ error: "Não foi possível excluir o mapeamento." }, { status: 409 });
  return NextResponse.json({ ok: true });
}
