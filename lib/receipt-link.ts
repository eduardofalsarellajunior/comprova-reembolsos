import { createHmac } from "node:crypto";

export type ReceiptLink = { source: string; type: string; expires: number; filename: string };

function base64UrlEncode(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

export function base64UrlDecode(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

export function createReceiptLinkToken(link: ReceiptLink, secret: string) {
  const payload = base64UrlEncode(JSON.stringify(link));
  const signature = createHmac("sha256", secret).update(payload).digest("hex");
  return `${payload}.${signature}`;
}

export function createReceiptLinkSignature(payload: string, secret: string) {
  return createHmac("sha256", secret).update(payload).digest("hex");
}
