import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

function sameSignature(received: string, expected: string) {
  if (!received || received.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(received, "utf8"), Buffer.from(expected, "utf8"));
}

export async function GET(request: Request, context: { params: Promise<{ filename: string }> }) {
  const token = process.env.VEXPENSES_API_TOKEN;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!token || !supabaseUrl) return new NextResponse("Indisponível", { status: 503 });

  const { filename } = await context.params;
  const url = new URL(request.url);
  const source = url.searchParams.get("source") || "";
  const type = url.searchParams.get("type") || "application/octet-stream";
  const expires = Number(url.searchParams.get("expires"));
  const signature = url.searchParams.get("signature") || "";
  const expected = createHmac("sha256", token).update(`${source}:${expires}:${filename}:${type}`).digest("hex");

  let sourceUrl: URL;
  try { sourceUrl = new URL(source); } catch { return new NextResponse("Link inválido", { status: 400 }); }
  const allowedHost = new URL(supabaseUrl).host;
  if (sourceUrl.protocol !== "https:" || sourceUrl.host !== allowedHost || !Number.isFinite(expires) || expires < Math.floor(Date.now() / 1000) || !sameSignature(signature, expected)) {
    return new NextResponse("Link expirado ou inválido", { status: 403 });
  }

  const fileResponse = await fetch(sourceUrl, { cache: "no-store" });
  if (!fileResponse.ok) return new NextResponse("Comprovante indisponível", { status: 502 });
  const bytes = await fileResponse.arrayBuffer();
  const safeName = filename.replace(/["\\\r\n]/g, "-");
  return new NextResponse(bytes, {
    headers: {
      "Content-Type": type,
      "Content-Length": String(bytes.byteLength),
      "Content-Disposition": `inline; filename="${safeName}"`,
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
