import { NextResponse } from "next/server";
import { awardEarn } from "@/lib/wallet";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let body: { sessionId?: string; gameId?: string; score?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const sessionId = body.sessionId ?? "";
  const gameId = body.gameId ?? "";
  const score = Number(body.score);
  if (!sessionId || !gameId || !Number.isFinite(score)) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  // The server decides the real payout (caps, daily limit, single-use session).
  const result = await awardEarn(sessionId, gameId, score);
  return NextResponse.json(result);
}
