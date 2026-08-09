import { NextResponse } from "next/server";
import { markClaimUsed } from "@/lib/wallet";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let body: { claimId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const claimId = body.claimId ?? "";
  if (!claimId) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const wallet = await markClaimUsed(claimId);
  return NextResponse.json({ wallet });
}
