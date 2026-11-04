import { query } from "@/lib/db";

// pgvector + bytea need the Node runtime, not edge.
export const runtime = "nodejs";

/**
 * Serve a stored card image by id. Behind the same auth as everything else via
 * src/proxy.ts (no matcher change needed). An image id's bytes never change, so
 * it is cached hard and marked immutable.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const numId = Number(id);
  if (!Number.isInteger(numId) || numId <= 0) {
    return new Response("Invalid id", { status: 400 });
  }

  const [row] = await query<{ mime: string; bytes: Buffer }>(
    "SELECT mime, bytes FROM card_images WHERE id = $1",
    [numId],
  );
  if (!row) {
    return new Response("Not found", { status: 404 });
  }

  const body = new Uint8Array(row.bytes);
  return new Response(body, {
    headers: {
      "Content-Type": row.mime,
      "Content-Length": String(body.byteLength),
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
