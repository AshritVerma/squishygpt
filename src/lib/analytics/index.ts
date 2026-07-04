// Portable, framework-agnostic usage-analytics client.
//
// This folder intentionally has ZERO app-specific imports so it can be lifted
// out into a shared SDK package later (see the Usage Analytics plan, Phase B).
// The only app-specific things are passed in via init(): the app_id, an
// optional write key, and the ingest endpoint. Event names are plain strings
// here; each app defines its own event catalog elsewhere.

export interface AnalyticsConfig {
  /** Stable identifier for the app emitting events (e.g. "squishygpt"). */
  appId: string;
  /** Where batches are POSTed. Defaults to a same-origin "/api/track". */
  endpoint?: string;
  /** Public-ish client key; forwarded to the collector (enforced later). */
  writeKey?: string;
  /** Flush the queue at most this often (ms). */
  flushIntervalMs?: number;
  /** Max events per outgoing batch. */
  batchSize?: number;
  /** Print queue/flush activity to the console (dev aid). */
  debug?: boolean;
}

export interface QueuedEvent {
  name: string;
  props: Record<string, unknown>;
  path: string;
  ts: string;
}

interface Batch {
  appId: string;
  writeKey?: string;
  visitorId: string;
  sessionId: string;
  events: QueuedEvent[];
}

const VISITOR_TTL_KEY = "analytics.visitor";
const SESSION_KEY = "analytics.session";

let config: Required<Omit<AnalyticsConfig, "writeKey">> & { writeKey?: string };
let started = false;
let disabled = false;
let queue: QueuedEvent[] = [];
let visitorId = "";
let sessionId = "";

function hasWindow(): boolean {
  return typeof window !== "undefined";
}

/** Respect Do Not Track (browser-level opt out). */
function doNotTrack(): boolean {
  if (!hasWindow()) return false;
  const nav = navigator as Navigator & { msDoNotTrack?: string };
  const dnt =
    nav.doNotTrack ||
    nav.msDoNotTrack ||
    (window as unknown as { doNotTrack?: string }).doNotTrack;
  return dnt === "1" || dnt === "yes";
}

function randomId(): string {
  if (hasWindow() && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

/** Stable per-device id, namespaced by app so multiple apps on one origin
 *  never collide. Kept in localStorage so it survives sessions. */
function loadVisitorId(appId: string): string {
  const key = `${VISITOR_TTL_KEY}.${appId}`;
  try {
    const existing = localStorage.getItem(key);
    if (existing) return existing;
    const id = randomId();
    localStorage.setItem(key, id);
    return id;
  } catch {
    return randomId();
  }
}

/** Per browser-session id (resets when the tab/session ends). */
function loadSessionId(appId: string): string {
  const key = `${SESSION_KEY}.${appId}`;
  try {
    const existing = sessionStorage.getItem(key);
    if (existing) return existing;
    const id = randomId();
    sessionStorage.setItem(key, id);
    return id;
  } catch {
    return randomId();
  }
}

function currentPath(): string {
  return hasWindow() ? window.location.pathname : "";
}

/** Initialize once at app startup. Safe to call on the server (no-ops). */
export function init(cfg: AnalyticsConfig): void {
  if (!hasWindow() || started) return;
  if (doNotTrack()) {
    disabled = true;
    return;
  }
  config = {
    appId: cfg.appId,
    endpoint: cfg.endpoint ?? "/api/track",
    writeKey: cfg.writeKey,
    flushIntervalMs: cfg.flushIntervalMs ?? 4000,
    batchSize: cfg.batchSize ?? 50,
    debug: cfg.debug ?? false,
  };
  visitorId = loadVisitorId(cfg.appId);
  sessionId = loadSessionId(cfg.appId);
  started = true;

  setInterval(() => flush(false), config.flushIntervalMs);
  // Best-effort flush when the tab is hidden or closed.
  window.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush(true);
  });
  window.addEventListener("pagehide", () => flush(true));
}

/** Record an event. No-ops before init(), under DNT, or on the server. */
export function track(name: string, props: Record<string, unknown> = {}): void {
  if (!started || disabled) return;
  queue.push({ name, props, path: currentPath(), ts: new Date().toISOString() });
  if (config.debug) console.debug("[analytics] track", name, props);
  if (queue.length >= config.batchSize) flush(false);
}

/** Placeholder for real per-user identity (see plan). No-op today. */
export function identify(_userId: string): void {
  void _userId;
}

/** Forget the current session id (e.g. on logout). Visitor id persists. */
export function reset(): void {
  if (!hasWindow() || !started) return;
  try {
    sessionStorage.removeItem(`${SESSION_KEY}.${config.appId}`);
  } catch {
    /* ignore */
  }
  sessionId = loadSessionId(config.appId);
}

function serialize(events: QueuedEvent[]): string {
  const batch: Batch = {
    appId: config.appId,
    writeKey: config.writeKey,
    visitorId,
    sessionId,
    events,
  };
  return JSON.stringify(batch);
}

/** Send queued events. `useBeacon` guarantees delivery during unload. */
export function flush(useBeacon: boolean): void {
  if (!started || disabled || queue.length === 0) return;
  const events = queue.splice(0, config.batchSize);
  const body = serialize(events);

  if (useBeacon && hasWindow() && "sendBeacon" in navigator) {
    const blob = new Blob([body], { type: "application/json" });
    const ok = navigator.sendBeacon(config.endpoint, blob);
    if (ok) return;
    // If the beacon was rejected, fall through to fetch.
  }

  fetch(config.endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => {
    // Re-queue on failure so a later flush can retry (bounded by batchSize).
    queue = [...events, ...queue].slice(0, config.batchSize * 4);
  });
}
