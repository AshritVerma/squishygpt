import { NextResponse } from "next/server";
import { startGameSession } from "@/lib/wallet";
import { EARN_CAPS } from "@/lib/rewards";

export const runtime = "nodejs";

const KNOWN_GAMES = new Set(Object.keys(EARN_CAPS));

export async function POST(req: Request) {
  let body: { gameId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const gameId = body.gameId ?? "";
  if (!KNOWN_GAMES.has(gameId)) {
    return NextResponse.json({ error: "Unknown game" }, { status: 400 });
  }
  const sessionId = await startGameSession(gameId);
  return NextResponse.json({ sessionId });
}
