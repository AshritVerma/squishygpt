import { NextResponse } from "next/server";
import { redeemReward } from "@/lib/wallet";
import { rewardById } from "@/lib/rewards";
import { notifyRedeem } from "@/lib/notify";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let body: { rewardId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const rewardId = body.rewardId ?? "";
  if (!rewardId) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const wallet = await redeemReward(rewardId);
  if (!wallet) {
    // Unknown reward or not enough points (server balance is the authority).
    return NextResponse.json({ error: "Cannot redeem" }, { status: 409 });
  }

  // Ping Ashrit out-of-band, now that the redeem is real and committed. The
  // alert carries the authoritative post-redeem balance. Best-effort: never
  // let a notification failure undo or block a successful redemption.
  const reward = rewardById(rewardId);
  if (reward) {
    try {
      await notifyRedeem({
        rewardId: reward.id,
        title: reward.title,
        emoji: reward.emoji,
        cost: reward.cost,
        balance: wallet.balance,
      });
    } catch {
      /* best-effort */
    }
  }

  return NextResponse.json({ wallet });
}
