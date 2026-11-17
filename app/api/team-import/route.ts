import { NextResponse } from "next/server";
import { createServerSupabase, getBearerToken } from "@/lib/server-auth";
import { parseTeamCsv } from "@/lib/team-profile";

const maxBodyBytes = 850_000;

class BodyTooLarge extends Error {}

async function readBoundedJson(request: Request) {
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > maxBodyBytes) throw new BodyTooLarge();
  const reader = request.body?.getReader();
  if (!reader) throw new Error("Corpo vazio.");
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let size = 0;
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBodyBytes) throw new BodyTooLarge();
      text += decoder.decode(value, { stream: true });
    }
    return JSON.parse(text + decoder.decode()) as unknown;
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

function response(payload: Record<string, unknown>, status: number) {
  return NextResponse.json(payload, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const token = getBearerToken(request);
  if (!token) return response({ error: "Sessão inválida." }, 401);
  const supabase = createServerSupabase(token);
  if (!supabase) return response({ error: "Serviço temporariamente indisponível." }, 503);
  const { data: auth, error: authError } = await supabase.auth.getUser(token);
  if (authError || !auth.user) return response({ error: "Sessão inválida." }, 401);

  let payload: unknown;
  try {
    payload = await readBoundedJson(request);
  } catch (error) {
    return error instanceof BodyTooLarge
      ? response({ error: "Arquivo muito grande. Separe a equipe em lotes de até 200 pessoas." }, 413)
      : response({ error: "Não foi possível ler o arquivo." }, 400);
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return response({ error: "Importação inválida." }, 400);
  const { companyId, csv, mode, confirmAdmins } = payload as Record<string, unknown>;
  if (typeof companyId !== "string" || !/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(companyId) ||
      typeof csv !== "string" || (mode !== "preview" && mode !== "commit")) {
    return response({ error: "Importação inválida." }, 400);
  }

  const { data: allowed, error: permissionError } = await supabase.rpc<boolean>("is_company_admin", { p_company_id: companyId });
  if (permissionError) return response({ error: "Não foi possível verificar a função de administrador." }, 503);
  if (allowed !== true) return response({ error: "Somente administradores podem importar membros." }, 403);

  let parsed;
  try {
    parsed = parseTeamCsv(csv);
  } catch (error) {
    return response({ error: error instanceof Error ? error.message : "Arquivo inválido." }, 400);
  }
  const { records, ignoredDocuments, missingCpf, defaultedRoles, adminRows } = parsed;
  const { data, error } = await supabase.rpc("import_company_members", {
    p_company_id: companyId,
    p_rows: records,
    p_commit: mode === "commit",
    p_confirm_admins: confirmAdmins === true,
  });
  if (error) {
    if (error.code === "42501") return response({ error: "Somente administradores podem importar membros." }, 403);
    if (error.code === "22023" && mode === "commit" && confirmAdmins !== true) {
      return response({ error: "Confira novamente a prévia e confirme qualquer nova conta administrativa." }, 409);
    }
    return response({ error: "Não foi possível concluir. Nenhum cadastro parcial foi mantido." }, 409);
  }
  return response({ ...(data as Record<string, unknown>), ignoredDocuments, missingCpf, defaultedRoles, adminRows }, 200);
}
