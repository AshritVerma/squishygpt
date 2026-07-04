"use client";

import { useEffect } from "react";
import { initAnalytics, track } from "@/lib/analyticsClient";
import { EASTER_EGG_EVENTS } from "@/lib/appEvents";

// App-level analytics wiring. Mounted once in the root layout. This is where
// SquishyGPT-specific instrumentation lives (the squishy:* bus), keeping the
// analytics core generic. It fires lifecycle events and maps the existing
// delight events to a single easter_egg event for near-zero-touch coverage.
export function UsageTracker() {
  useEffect(() => {
    initAnalytics();
    track("session_start", {
      referrer: document.referrer || null,
      viewport: `${window.innerWidth}x${window.innerHeight}`,
    });
    track("page_view", { path: window.location.pathname });

    // Bridge the existing squishy:* window events into analytics. Each maps to
    // one easter_egg event tagged with which egg fired. nap/glasses fire on
    // both open and close, so only count the "on" transition.
    const handlers: Array<[string, (e: Event) => void]> = Object.entries(
      EASTER_EGG_EVENTS,
    ).map(([evName, egg]) => {
      const handler = (e: Event) => {
        const detail = (e as CustomEvent).detail as
          | { open?: boolean; stolen?: boolean }
          | undefined;
        if (detail && (detail.open === false || detail.stolen === false)) return;
        track("easter_egg", { egg });
      };
      return [evName, handler];
    });

    for (const [name, handler] of handlers) {
      window.addEventListener(name, handler as EventListener);
    }
    return () => {
      for (const [name, handler] of handlers) {
        window.removeEventListener(name, handler as EventListener);
      }
    };
  }, []);

  return null;
}
