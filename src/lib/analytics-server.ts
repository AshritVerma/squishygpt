// Server-side event capture. Reliable, ad-block-proof events fired directly
// from API routes (chat latency/tokens, study-set changes). These are relayed
// to the standalone Orbit analytics service via the server-side forwarder, so
// no analytics data lives in SquishyGPT's own database.

import { forwardToOrbit, type ForwardCtx } from "@/lib/orbit";

/** Emit a single server-originated event to Orbit. Swallows errors so
 *  analytics can never break the request it is measuring. */
export async function trackServer(
  name: string,
  props: Record<string, unknown> = {},
  ctx: ForwardCtx & { path?: string | null } = {},
): Promise<void> {
  const { path, ...rest } = ctx;
  await forwardToOrbit([{ name, props, path: path ?? null }], {
    ...rest,
    source: "server",
  });
}
