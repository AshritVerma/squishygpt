import { NextResponse } from "next/server";
import { getSet } from "@/lib/sets";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const numId = Number(id);
  if (!Number.isFinite(numId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const set = await getSet(numId);
  if (!set) {
    return NextResponse.json({ error: "Set not found" }, { status: 404 });
  }
  return NextResponse.json({ set });
}
