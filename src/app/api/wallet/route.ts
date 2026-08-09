import { NextResponse } from "next/server";
import { getWalletState } from "@/lib/wallet";

// pgvector/pg needs Node, not edge. Auth is enforced by middleware.
export const runtime = "nodejs";

export async function GET() {
  const wallet = await getWalletState();
  return NextResponse.json({ wallet });
}
