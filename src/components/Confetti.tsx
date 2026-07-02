"use client";

import { useEffect, useState, type CSSProperties } from "react";

const COLORS = [
  "#ec4899",
  "#a855f7",
  "#8b5cf6",
  "#f472b6",
  "#ffd23f",
  "#34d399",
];

// A one-shot confetti burst — no dependencies, just CSS-animated pieces that
// rain down and fade. Renders nothing after it finishes (parent unmounts it).
export function Confetti({ onDone }: { onDone?: () => void }) {
  const [pieces] = useState(() =>
    Array.from({ length: 46 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 0.25,
      dur: 1 + Math.random() * 0.9,
      rot: (Math.random() * 2 - 1) * 540,
      drift: (Math.random() * 2 - 1) * 90,
      color: COLORS[i % COLORS.length],
      size: 6 + Math.random() * 6,
    })),
  );

  useEffect(() => {
    const t = window.setTimeout(() => onDone?.(), 2100);
    return () => window.clearTimeout(t);
  }, [onDone]);

  return (
    <div className="confetti-layer" aria-hidden>
      {pieces.map((p) => (
        <span
          key={p.id}
          className="confetti-piece"
          style={
            {
              left: `${p.left}%`,
              width: p.size,
              height: p.size * 0.6,
              background: p.color,
              animationDelay: `${p.delay}s`,
              animationDuration: `${p.dur}s`,
              "--drift": `${p.drift}px`,
              "--rot": `${p.rot}deg`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}
