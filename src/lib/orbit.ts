// Forwards SquishyGPT's usage events to the standalone Orbit analytics service.
// Runs server-side only, so the write key stays private (never shipped to the
// browser) and there are no cross-origin/CORS concerns: the client posts to
// SquishyGPT's own /api/track, which relays here.

const ORBIT_ENDPOINT = process.env.ORBIT_ENDPOINT;
const ORBIT_WRITE_KEY = process.env.ORBIT_WRITE_KEY;
const ORBIT_APP_ID = process.env.ORBIT_APP_ID || "squishygpt";

export interface OrbitEvent {
  name: string;
  props?: Record<string, unknown>;
  path?: string | null;
  ts?: string;
}

export interface ForwardCtx {
  visitorId?: string | null;
  sessionId?: string | null;
  source?: "client" | "server";
}

/** Relay a batch of events to Orbit. Never throws; analytics must not break the
 *  request it is measuring. No-ops if Orbit isn't configured. */
export async function forwardToOrbit(
  events: OrbitEvent[],
  ctx: ForwardCtx = {},
): Promise<void> {
  if (!ORBIT_ENDPOINT || !ORBIT_WRITE_KEY || events.length === 0) return;
  const body = JSON.stringify({
    appId: ORBIT_APP_ID,
    writeKey: ORBIT_WRITE_KEY,
    source: ctx.source ?? "client",
    visitorId: ctx.visitorId ?? null,
    sessionId: ctx.sessionId ?? null,
    events,
  });
  try {
    await fetch(ORBIT_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
  } catch (err) {
    console.error("[orbit] forward failed:", err);
  }
}
