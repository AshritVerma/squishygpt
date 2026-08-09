import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export const runtime = "nodejs";

// Small key/value sync for client state (single-user app, gated by middleware).
// NOTE: "wallet" is intentionally NOT allowed here — the paw-points balance is
// server-authoritative (see /api/wallet + src/lib/wallet.ts) so it can't be set
// by PUTing arbitrary JSON. Only cosmetic, non-currency state syncs through here.
const ALLOWED_KEYS = new Set(["conversations", "arcade"]);

export async function GET(req: Request) {
  const key = new URL(req.url).searchParams.get("key") ?? "";
  if (!ALLOWED_KEYS.has(key)) {
    return NextResponse.json({ error: "Unknown key" }, { status: 400 });
  }
  const rows = await query<{ value: unknown }>(
    "SELECT value FROM client_state WHERE key = $1",
    [key],
  );
  return NextResponse.json({ value: rows[0]?.value ?? null });
}

export async function PUT(req: Request) {
  let body: { key?: string; value?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const key = body.key ?? "";
  if (!ALLOWED_KEYS.has(key) || body.value === undefined) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  await query(
    `INSERT INTO client_state (key, value, updated_at)
     VALUES ($1, $2, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [key, JSON.stringify(body.value)],
  );
  return NextResponse.json({ ok: true });
}
