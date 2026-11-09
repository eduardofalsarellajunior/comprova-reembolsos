import { NextResponse } from "next/server";
import { contaAzulFetch, buildPayablePayload, refreshContaAzulToken } from "@/lib/conta-azul";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { decryptSecret, encryptSecret } from "@/lib/secret-crypto";

export const runtime = "nodejs";
export const maxDuration = 60;

function authorized(request: Request) {
  const expected = process.env.CONTA_AZUL_SYNC_CRON_SECRET;
  const bearer = request.headers.get("authorization") || "";
  return Boolean(expected && (request.headers.get("x-cron-secret") === expected || bearer === `Bearer ${expected}`));
}

async function accessToken(admin: ReturnType<typeof createAdminSupabase>, connection: { id: string; access_token_ciphertext: string | null; refresh_token_ciphertext: string | null; token_expires_at: string | null }) {
  if (!admin) throw new Error("Servidor não configurado.");
  if (connection.access_token_ciphertext && connection.token_expires_at && new Date(connection.token_expires_at).getTime() > Date.now() + 60_000) return decryptSecret(connection.access_token_ciphertext);
  if (!connection.refresh_token_ciphertext) throw new Error("A conexão Conta Azul não possui refresh token.");
  const tokens = await refreshContaAzulToken(decryptSecret(connection.refresh_token_ciphertext));
  await admin.from("integration_connections").update({ access_token_ciphertext: encryptSecret(tokens.access_token), refresh_token_ciphertext: tokens.refresh_token ? encryptSecret(tokens.refresh_token) : connection.refresh_token_ciphertext, token_expires_at: new Date(Date.now() + Number(tokens.expires_in || 3600) * 1000).toISOString(), updated_at: new Date().toISOString() }).eq("id", connection.id);
  return tokens.access_token;
}

export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  const admin = createAdminSupabase();
  if (!admin) return NextResponse.json({ error: "Servidor de integração não configurado." }, { status: 503 });
  const { data: jobs } = await admin.from("sync_jobs").select("*").in("status", ["pending", "failed"]).lte("next_attempt_at", new Date().toISOString()).order("created_at", { ascending: true }).limit(10);
  const results: Array<{ id: string; status: string; error?: string }> = [];
  for (const job of jobs || []) {
    const { data: claimed, error: claimError } = await admin.from("sync_jobs")
      .update({ status: "running", attempts: job.attempts + 1, started_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", job.id).eq("status", job.status).eq("attempts", job.attempts)
      .select("id").maybeSingle();
    if (claimError) {
      results.push({ id: job.id, status: "failed", error: "Não foi possível reservar o trabalho." });
      continue;
    }
    if (!claimed) continue;
    try {
      const { data: connection } = await admin.from("integration_connections").select("id,access_token_ciphertext,refresh_token_ciphertext,token_expires_at").eq("id", job.connection_id).eq("status", "connected").single();
      if (!connection) throw new Error("Conexão Conta Azul indisponível.");
      const access = await accessToken(admin, connection);
      if (job.job_type === "refresh_metadata") {
        await contaAzulFetch(access, "/v1/financeiro/centros-de-custo?pagina=1&tamanho_pagina=100");
      } else if (job.job_type === "reconcile_report") {
        await contaAzulFetch(access, "/v1/financeiro/contas-a-pagar?pagina=1&tamanho_pagina=100&data_vencimento_de=2000-01-01&data_vencimento_ate=2099-12-31");
      } else {
        const { data: rawReport } = await admin.from("reports").select("id,name,period_start,period_end,report_expenses(expense_id,position)").eq("id", job.report_id).single();
        const report = rawReport as { id: string; name: string; report_expenses?: Array<{ expense_id: string; position: number }> } | null;
        if (!report) throw new Error("Relatório não encontrado.");
        const { data: mappings } = await admin.from("accounting_mappings").select("mapping_kind,local_key,external_id").eq("connection_id", job.connection_id).eq("active", true);
        const mapping: Map<string, string> = new Map((mappings || []).map((item: { mapping_kind: string; local_key: string; external_id: string }) => [item.mapping_kind + ":" + item.local_key, item.external_id]));
        for (const item of report.report_expenses || []) {
          const { data: existing, error: lookupError } = await admin.from("external_records")
            .select("external_id").eq("connection_id", job.connection_id)
            .eq("entity_type", "expense").eq("local_id", item.expense_id).maybeSingle();
          if (lookupError) throw lookupError;
          if (existing?.external_id) continue;
          const { data: rawExpense } = await admin.from("expenses").select("id,supplier,expense_date,amount,category,description,notes").eq("id", item.expense_id).single();
          const expense = rawExpense as { id: string; supplier: string | null; expense_date: string | null; amount: number | string | null; category: string | null; description: string | null; notes: string | null } | null;
          if (!expense || !expense.expense_date || expense.amount === null) throw new Error("Despesa sem data ou valor.");
          const supplierId = mapping.get(`supplier:${expense.supplier}`) || mapping.get("supplier:*");
          const categoryId = mapping.get(`category:${expense.category}`) || mapping.get("category:*");
          const financialAccountId = mapping.get("financial_account:default");
          const costCenterId = mapping.get("cost_center:default");
          if (!supplierId || !categoryId || !financialAccountId) throw new Error(`Mapeamento contábil incompleto para ${expense.supplier || expense.category}.`);
          const payload = buildPayablePayload({ description: expense.description || expense.supplier || "Despesa de reembolso", expenseDate: expense.expense_date, amount: Number(expense.amount), supplierId, financialAccountId, categoryId, costCenterId, observation: expense.notes || `Relatório ${report.name}`, externalReference: `COMPROVA-${report.id}-${expense.id}` });
          const created = await contaAzulFetch(access, "/v1/financeiro/contas-a-pagar", { method: "POST", body: JSON.stringify(payload) });
          if (!created?.id) throw new Error("A Conta Azul não confirmou o ID do lançamento. Verifique manualmente antes de repetir.");
          const { error: recordError } = await admin.from("external_records").upsert({ connection_id: job.connection_id, entity_type: "expense", local_id: expense.id, external_id: String(created.id), status: "active", last_synced_at: new Date().toISOString(), updated_at: new Date().toISOString() }, { onConflict: "connection_id,entity_type,local_id" });
          if (recordError) throw new Error("Lançamento criado, mas não registrado localmente. Reconcilie manualmente antes de repetir.");
        }
      }
      await admin.from("sync_jobs").update({ status: "succeeded", finished_at: new Date().toISOString(), last_error: null, updated_at: new Date().toISOString() }).eq("id", job.id);
      await admin.from("sync_events").insert({ sync_job_id: job.id, event_type: job.job_type, status: "succeeded", payload: { attempts: job.attempts + 1 } });
      results.push({ id: job.id, status: "succeeded" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha na sincronização.";
      // Uma falha após o POST pode ter criado o título mesmo sem resposta. Não repetir automaticamente.
      const dead = job.job_type === "export_report" || job.attempts + 1 >= 5;
      await admin.from("sync_jobs").update({ status: dead ? "dead_letter" : "failed", last_error: message, next_attempt_at: new Date(Date.now() + Math.min(60 * 60 * 1000, 2 ** (job.attempts + 1) * 60 * 1000)).toISOString(), finished_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", job.id);
      await admin.from("sync_events").insert({ sync_job_id: job.id, event_type: job.job_type, status: dead ? "dead_letter" : "failed", payload: { message } });
      results.push({ id: job.id, status: dead ? "dead_letter" : "failed", error: message });
    }
  }
  return NextResponse.json({ processed: results.length, results });
}
