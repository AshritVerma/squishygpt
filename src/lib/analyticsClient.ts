// SquishyGPT's typed binding to the portable analytics core. Call sites import
// `track` from here so event names are checked against the app catalog, while
// the core (src/lib/analytics) stays generic and extractable.
"use client";

import { init, track as coreTrack, identify, flush } from "@/lib/analytics";
import { APP_ID, type AppEvent } from "@/lib/appEvents";

/** Initialize analytics for SquishyGPT. Call once at app startup. */
export function initAnalytics(): void {
  init({
    appId: APP_ID,
    endpoint: "/api/track",
    debug: process.env.NODE_ENV !== "production",
  });
}

/** Record a SquishyGPT event (name is checked against the app catalog). */
export function track(name: AppEvent, props?: Record<string, unknown>): void {
  coreTrack(name, props);
}

export { identify, flush };
