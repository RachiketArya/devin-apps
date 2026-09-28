import { createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "pa_session";

const secret = process.env.AUTH_SECRET ?? "dev-only-insecure-secret";

function hmac(payload: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function encodeSession(userId: string): string {
  const payload = Buffer.from(JSON.stringify({ sub: userId })).toString(
    "base64url",
  );
  return `${payload}.${hmac(payload)}`;
}

export function decodeSession(value: string | undefined): string | null {
  if (!value) return null;
  const [payload, sig] = value.split(".");
  if (!payload || !sig) return null;
  const expected = hmac(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString());
    return typeof parsed.sub === "string" ? parsed.sub : null;
  } catch {
    return null;
  }
}
