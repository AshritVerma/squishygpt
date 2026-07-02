"use client";

import { useEffect, useRef, useState } from "react";

interface Spark {
  id: number;
  x: number;
  y: number;
  glyph: string;
  size: number;
}

const GLYPHS = ["✨", "🩷", "·", "✦"];

// A faint pink glitter trail that follows the cursor on desktop. Pointer-fine
// devices only, throttled, and skipped entirely under reduced motion.
export function SparkleTrail() {
  const [sparks, setSparks] = useState<Spark[]>([]);
  const lastRef = useRef(0);
  const idRef = useRef(0);

  useEffect(() => {
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!fine || reduce) return;

    const onMove = (e: PointerEvent) => {
      const now = performance.now();
      if (now - lastRef.current < 45) return;
      lastRef.current = now;
      const id = idRef.current++;
      const spark: Spark = {
        id,
        x: e.clientX,
        y: e.clientY,
        glyph: GLYPHS[Math.floor(Math.random() * GLYPHS.length)],
        size: 8 + Math.random() * 7,
      };
      setSparks((s) => [...s.slice(-11), spark]);
      window.setTimeout(
        () => setSparks((s) => s.filter((x) => x.id !== id)),
        650,
      );
    };

    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, []);

  if (sparks.length === 0) return null;

  return (
    <div className="sparkle-layer" aria-hidden>
      {sparks.map((s) => (
        <span
          key={s.id}
          className="sparkle-dot"
          style={{ left: s.x, top: s.y, fontSize: s.size }}
        >
          {s.glyph}
        </span>
      ))}
    </div>
  );
}
