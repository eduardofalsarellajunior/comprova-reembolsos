import { createAdminSupabase } from "@/lib/supabase/admin";
import { dispatchConfiguredApprovalEmails, type ApprovalEmailJob } from "@/lib/email-server";

// Called only by server routes, after the decision transaction has committed.
export async function dispatchConfiguredApprovalEmailQueue(instanceId?: string) {
  return dispatchConfiguredApprovalEmails(process.env, () => {
    const supabase = createAdminSupabase();
    if (!supabase) return null;
    return {
      async claim(limit) {
        const { data, error } = await supabase.rpc("claim_approval_emails", { p_limit: limit, p_instance_id: instanceId || null });
        if (error) throw new Error("outbox_unavailable");
        return (data || []) as ApprovalEmailJob[];
      },
      async finish(job, delivery) {
        const { data, error } = await supabase.rpc("finish_approval_email", {
          p_id: job.id, p_lease: job.lease_token, p_success: delivery.success,
          p_retryable: !delivery.success && delivery.retryable,
          p_provider_id: delivery.success ? delivery.providerId : null,
          p_error_code: delivery.success ? null : delivery.code,
        });
        if (error) throw new Error("outbox_unavailable");
        return data === true;
      },
    };
  }, instanceId ? 1 : 5);
}
