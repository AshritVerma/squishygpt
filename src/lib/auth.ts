// Lightweight single-password session using HMAC-signed cookies.
// Uses Web Crypto so it works in both the Edge middleware and Node runtimes.

export const SESSION_COOKIE = "squishy_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

function getSecret(): string {
  return process.env.SESSION_SECRET || process.env.SITE_PASSWORD || "squishy-dev-secret";
}

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hmac(payload: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(getSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  return toHex(sig);
}

export async function createSessionToken(): Promise<string> {
  const payload = `ok.${Date.now()}`;
  const sig = await hmac(payload);
  return `${payload}.${sig}`;
}

export async function verifySessionToken(
  token: string | undefined | null,
): Promise<boolean> {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [prefix, ts, sig] = parts;
  const payload = `${prefix}.${ts}`;
  const expected = await hmac(payload);
  if (sig !== expected) return false;
  const issued = Number(ts);
  if (!Number.isFinite(issued)) return false;
  if (Date.now() - issued > SESSION_TTL_MS) return false;
  return true;
}

export const sessionCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: Math.floor(SESSION_TTL_MS / 1000),
};
