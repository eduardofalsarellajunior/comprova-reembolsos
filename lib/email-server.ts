// Server only. No provider credentials, payloads, recipients or errors are logged.
import { createHash, timingSafeEqual } from "node:crypto";

export type ApprovalEmailJob = {
  id: string;
  lease_token: string;
  attempts: number;
  recipient: string | null;
  payload: { reportName: string; reportCode: string | null; totalAmount: string | number; currency: string; approvedAt: string };
};

export type EmailResult = { success: true; providerId: string } | {
  success: false;
  retryable: boolean;
  code: "provider_unavailable" | "provider_rejected" | "invalid_message" | "recipient_missing";
};

export type ApprovalEmailStore = {
  claim: (limit: number) => Promise<ApprovalEmailJob[]>;
  finish: (job: ApprovalEmailJob, result: EmailResult) => Promise<boolean>;
};

type EmailMessage = { to: string; subject: string; html: string; text: string };
export type EmailProvider = { send: (message: EmailMessage, idempotencyKey: string) => Promise<EmailResult> };

const emailAddress = /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/;
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);

export function approvalEmailMessage(job: ApprovalEmailJob): EmailMessage | null {
  const { recipient, payload } = job;
  if (!recipient || recipient.length > 254 || !emailAddress.test(recipient)) return null;
  if (!payload || typeof payload.reportName !== "string" || payload.reportName.length > 1000
    || !/^[A-Z]{3}$/.test(payload.currency) || !Number.isFinite(Number(payload.totalAmount))) return null;
  let amount: string;
  try { amount = new Intl.NumberFormat("pt-BR", { style: "currency", currency: payload.currency }).format(Number(payload.totalAmount)); }
  catch { return null; }
  const title = payload.reportCode ? `${payload.reportCode} — ${payload.reportName}` : payload.reportName;
  return {
    to: recipient,
    subject: "Seu relatório foi aprovado | INEPAD Reembolso",
    text: `Seu relatório foi aprovado.\n\n${title}\nTotal: ${amount}\n\nA aprovação não confirma pagamento. Acompanhe o relatório no INEPAD Reembolso.`,
    html: `<p>Seu relatório foi aprovado.</p><p><strong>${escapeHtml(title)}</strong></p><p>Total: ${escapeHtml(amount)}</p><p>A aprovação não confirma pagamento. Acompanhe o relatório no INEPAD Reembolso.</p>`,
  };
}

export function authorizedEmailDispatcher(authorization: string | null, secret: string | undefined) {
  if (!secret || secret.length < 32 || !authorization?.startsWith("Bearer ")) return false;
  const supplied = createHash("sha256").update(authorization.slice(7)).digest();
  const expected = createHash("sha256").update(secret).digest();
  return timingSafeEqual(supplied, expected);
}

// The provider is opt-in. Missing config must not claim a job or pretend it was sent.
// Resend retains idempotency keys for 24h; SQL stops automatic retries after 23h.
export function createEmailProvider(env: Record<string, string | undefined>, fetcher: typeof fetch = fetch): EmailProvider | null {
  if (env.COMPROVA_EMAIL_PROVIDER !== "resend" || !env.RESEND_API_KEY || !env.COMPROVA_EMAIL_FROM
    || /[\r\n]/.test(env.COMPROVA_EMAIL_FROM) || env.COMPROVA_EMAIL_FROM.length > 320) return null;
  const sender = env.COMPROVA_EMAIL_FROM;
  const senderAddress = sender.match(/<([^<>]+)>$/)?.[1] ?? sender;
  if (!emailAddress.test(senderAddress)) return null;
  const apiKey = env.RESEND_API_KEY;
  return {
    async send(message, idempotencyKey) {
      try {
        const response = await fetcher("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
          body: JSON.stringify({ from: sender, to: [message.to], subject: message.subject, html: message.html, text: message.text }),
          signal: AbortSignal.timeout(15000),
        });
        if (!response.ok) {
          // A concurrent request with this key is transient; a changed payload is
          // not. Never log or return the provider's message/body to the caller.
          const conflict = response.status === 409
            ? await response.json().catch(() => null) as { name?: unknown } | null
            : null;
          const retryable = response.status === 429 || response.status >= 500 ||
            (response.status === 409 && conflict?.name === "concurrent_idempotent_requests");
          return { success: false, retryable, code: retryable ? "provider_unavailable" : "provider_rejected" };
        }
        const data = await response.json().catch(() => null) as { id?: unknown } | null;
        if (typeof data?.id !== "string" || !data.id || data.id.length > 200) return { success: false, retryable: true, code: "provider_unavailable" };
        return { success: true, providerId: data.id };
      } catch {
        // Includes ambiguous timeouts: retry with the same immutable outbox ID.
        return { success: false, retryable: true, code: "provider_unavailable" };
      }
    },
  };
}

export async function dispatchApprovalEmailBatch(store: ApprovalEmailStore, provider: EmailProvider, limit = 5) {
  const result = { attempted: 0, sent: 0, retry: 0, failed: 0, unconfirmed: 0 };
  for (const job of await store.claim(limit)) {
    result.attempted++;
    const message = approvalEmailMessage(job);
    let delivery: EmailResult;
    if (!message) delivery = { success: false, retryable: false, code: job.recipient ? "invalid_message" : "recipient_missing" };
    else {
      try { delivery = await provider.send(message, `inepad-report-approved/${job.id}`); }
      catch { delivery = { success: false, retryable: true, code: "provider_unavailable" }; }
    }
    // A failed acknowledgement is deliberately not reported as sent. A later lease
    // retries the same provider key, without repeating the approval itself.
    let acknowledged = false;
    try { acknowledged = await store.finish(job, delivery); } catch { /* lease will expire */ }
    if (!acknowledged) result.unconfirmed++;
    else if (delivery.success) result.sent++;
    else if (delivery.retryable && job.attempts < 5) result.retry++;
    else result.failed++;
  }
  return result;
}

export async function dispatchConfiguredApprovalEmails(
  env: Record<string, string | undefined>, storeFactory: () => ApprovalEmailStore | null,
  limit = 5, fetcher: typeof fetch = fetch,
) {
  if (env.COMPROVA_EMAIL_SEND_ENABLED !== "true") return { enabled: false } as const;
  const provider = createEmailProvider(env, fetcher);
  if (!provider) return { enabled: false } as const;
  const store = storeFactory();
  if (!store) return { enabled: false } as const;
  return { enabled: true, ...await dispatchApprovalEmailBatch(store, provider, limit) } as const;
}
