import { NextResponse } from "next/server";
import { authorizedEmailDispatcher } from "@/lib/email-server";
import { dispatchConfiguredApprovalEmailQueue } from "@/lib/email-dispatch";

export const runtime = "nodejs";

// No cron is activated by this route. Configure an authorized scheduler separately.
export async function POST(request: Request) {
  if (!authorizedEmailDispatcher(request.headers.get("authorization"), process.env.COMPROVA_EMAIL_DISPATCH_SECRET)) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }
  try {
    const result = await dispatchConfiguredApprovalEmailQueue();
    if (!result.enabled) return NextResponse.json({ error: "Serviço de e-mail não configurado ou não habilitado." }, { status: 503 });
    // "sent" means accepted by the provider, not confirmed inbox delivery.
    return NextResponse.json(result, { status: result.unconfirmed ? 503 : 200 });
  } catch {
    return NextResponse.json({ error: "Fila de e-mail indisponível." }, { status: 503 });
  }
}
