import { NextResponse } from "next/server";
import { isAllowedEvent } from "@/lib/appEvents";
import { forwardToOrbit, type OrbitEvent } from "@/lib/orbit";

export const runtime = "nodejs";

// Same-origin relay for client-emitted usage events. The browser SDK posts
// batches here (behind SquishyGPT's auth); we validate names against the app
// catalog and forward them to the Orbit analytics service server-side. Keeping
// this hop server-side means the Orbit write key is never exposed to the client.

const MAX_EVENTS = 100;

interface IncomingEvent {
  name?: unknown;
  props?: unknown;
  path?: unknown;
}
interface IncomingBatch {
  visitorId?: unknown;
  sessionId?: unknown;
  events?: unknown;
}

function asString(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

export async function POST(req: Request) {
  let body: IncomingBatch;
  try {
    body = (await req.json()) as IncomingBatch;
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const visitorId = asString(body.visitorId);
  const sessionId = asString(body.sessionId);
  const list = Array.isArray(body.events) ? body.events : [];
  if (list.length === 0) return NextResponse.json({ ok: true, accepted: 0 });

  const events: OrbitEvent[] = [];
  for (const raw of list.slice(0, MAX_EVENTS)) {
    const e = raw as IncomingEvent;
    if (!isAllowedEvent(e.name)) continue; // silently drop unknown events
    events.push({
      name: e.name,
      props:
        e.props && typeof e.props === "object"
          ? (e.props as Record<string, unknown>)
          : {},
      path: asString(e.path),
    });
  }

  await forwardToOrbit(events, { visitorId, sessionId, source: "client" });
  return NextResponse.json({ ok: true, accepted: events.length });
}
