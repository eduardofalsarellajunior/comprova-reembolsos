import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { base64UrlDecode, createReceiptLinkSignature, type ReceiptLink } from "@/lib/receipt-link";

export const runtime = "nodejs";

function sameSignature(received: string, expected: string) {
  if (!received || received.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(received, "utf8"), Buffer.from(expected, "utf8"));
}

export async function GET(_request: Request, context: { params: Promise<{ token: string; filename: string }> }) {
  const secret = process.env.VEXPENSES_API_TOKEN;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!secret || !supabaseUrl) return new NextResponse("Indisponivel", { status: 503 });

  const { token, filename } = await context.params;
  const [payload, signature] = token.split(".");
  const expected = createReceiptLinkSignature(payload || "", secret);
  if (!payload || !signature || !sameSignature(signature, expected)) return new NextResponse("Link invalido", { status: 403 });

  let link: ReceiptLink;
  try { link = JSON.parse(base64UrlDecode(payload)) as ReceiptLink; } catch { return new NextResponse("Link invalido", { status: 400 }); }

  let sourceUrl: URL;
  try { sourceUrl = new URL(link.source); } catch { return new NextResponse("Link invalido", { status: 400 }); }

  const allowedHost = new URL(supabaseUrl).host;
  if (sourceUrl.protocol !== "https:" || sourceUrl.host !== allowedHost || !Number.isFinite(link.expires) || link.expires < Math.floor(Date.now() / 1000)) {
    return new NextResponse("Link expirado ou invalido", { status: 403 });
  }

  const fileResponse = await fetch(sourceUrl, { cache: "no-store" });
  if (!fileResponse.ok) return new NextResponse("Comprovante indisponivel", { status: 502 });

  const bytes = await fileResponse.arrayBuffer();
  const safeName = (link.filename || filename).replace(/["\\\r\n]/g, "-");
  return new NextResponse(bytes, {
    headers: {
      "Content-Type": link.type || "application/octet-stream",
      "Content-Length": String(bytes.byteLength),
      "Content-Disposition": `inline; filename="${safeName}"`,
      "Cache-Control": "public, max-age=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
