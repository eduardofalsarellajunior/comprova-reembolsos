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
  const body = await request.json().catch(() => null) as { decision?: "approve" | "reject"; reason?: string } | null;
  if (!body?.decision) return NextResponse.json({ error: "Decisão não informada." }, { status: 400 });
  const { data: instance } = await supabase.from("approval_instances").select("*, approval_steps!inner(approver_user_id, step_order)").eq("id", id).eq("status", "pending").eq("approval_steps.approver_user_id", auth.user.id).eq("approval_steps.step_order", (await supabase.from("approval_instances").select("current_step").eq("id", id).single()).data?.current_step || 0).single();
  if (!instance) return NextResponse.json({ error: "Aprovação não encontrada ou não atribuída a este usuário." }, { status: 403 });
  const nextStatus = body.decision === "reject" ? "rejected" : "approved";
  const { error: instanceError } = await supabase.from("approval_instances").update({ status: nextStatus, decided_by: auth.user.id, decided_at: new Date().toISOString(), rejection_reason: body.decision === "reject" ? body.reason || "Rejeitado pelo aprovador." : null, updated_at: new Date().toISOString() }).eq("id", id);
  if (instanceError) return NextResponse.json({ error: "Não foi possível registrar a decisão." }, { status: 500 });
  const { data: report } = await supabase.from("approval_instances").select("report_id, reports!inner(owner_id)").eq("id", id).single();
  if (report?.report_id) {
    await supabase.from("reports").update({ status: nextStatus, rejection_reason: body.decision === "reject" ? body.reason || "Rejeitado pelo aprovador." : null, approved_at: nextStatus === "approved" ? new Date().toISOString() : null, updated_at: new Date().toISOString() }).eq("id", report.report_id);
    if (nextStatus === "approved") {
      const owner = Array.isArray(report.reports) ? report.reports[0]?.owner_id : (report.reports as { owner_id?: string } | null)?.owner_id;
      const { data: connection } = owner ? await supabase.from("integration_connections").select("id").eq("owner_id", owner).eq("provider", "conta_azul").eq("status", "connected").limit(1).maybeSingle() : { data: null };
      if (connection) await supabase.from("sync_jobs").insert({ connection_id: connection.id, report_id: report.report_id, job_type: "export_report", status: "pending", idempotency_key: `export_report:${report.report_id}:${connection.id}` });
    }
  }
  return NextResponse.json({ ok: true, status: nextStatus });
}
