import { NextResponse } from "next/server";
import { claimBirthdayGift } from "@/lib/wallet";

export const runtime = "nodejs";

// Claim the once-a-year birthday gift. Safe to call repeatedly: the server
// only awards on Aug 25 (NY time) and only once per year (ledger-tagged).
export async function POST() {
  const result = await claimBirthdayGift();
  return NextResponse.json(result);
}
