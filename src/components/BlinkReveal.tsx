"use client";

import { useEffect, useState } from "react";

// A quick "blink" that parts like an eyelid on first load of the session —
// a small optometry-flavored flourish. Plays once per browser session and is
// skipped entirely for reduced-motion users.
export function BlinkReveal() {
  const [show, setShow] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem("squishy.blinked")) return;
    sessionStorage.setItem("squishy.blinked", "1");
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;

    setShow(true);
    const raf = requestAnimationFrame(() =>
      requestAnimationFrame(() => setOpen(true)),
    );
    const t = window.setTimeout(() => setShow(false), 750);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(t);
    };
  }, []);

  if (!show) return null;

  return (
    <div className="blink-overlay" aria-hidden>
      <div className={`blink-lid blink-top ${open ? "open" : ""}`} />
      <div className={`blink-lid blink-bottom ${open ? "open" : ""}`} />
    </div>
  );
}
