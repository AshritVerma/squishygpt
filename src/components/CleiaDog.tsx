"use client";

import { useEffect, useRef, useState } from "react";

// Cleia — a bit-style pixel-art cavapoo who visits at random. She trots up from
// the bottom of the screen, wags her tail, woofs, and loves to say "hi mommy".

const PALETTE: Record<string, string> = {
  D: "#8a5636", // dark curls / ears
  C: "#e3a86e", // coat (apricot)
  L: "#f4ddbf", // light muzzle / paws
  N: "#2b2020", // nose
  E: "#241a1a", // eyes
  W: "#ffffff", // eye shine
  P: "#ff8aa8", // tongue
  K: "#ec4899", // collar (brand pink)
};

// Each character is one pixel; column index = x, row index = y.
const SPRITE = [
  "   DD     DD   ",
  "  DDDD   DDDD  ",
  "  DDDDD DDDDD  ",
  "  DDCCCCCCCDD  ",
  " DDCCCCCCCCCDD ",
  " DCCCCCCCCCCCD ",
  " DCCEECCCEECCD ",
  " DCCEWCCCEWCCD ",
  " DCCCLLNLLCCCD ",
  " DCCCCPPCCCCCD ",
  "  DCCCCCCCCCD  ",
  "  DKKKKKKKKD   ",
  "  CCCCCCCCCCC  ",
  "  CCC   CCC    ",
  "  LL     LL    ",
];

// Tail pixels (drawn in their own group so they can wag), grid coords.
const TAIL: [number, number][] = [
  [13, 11],
  [14, 10],
  [15, 9],
  [15, 10],
];

const GRID_W = 17;
const GRID_H = SPRITE.length;

const MESSAGES = ["Woof!", "hi mommy!", "woof woof!", "🐾 hi mommy 🐾", "Woof! 🐶"];

export function CleiaDog({ pixel = 6 }: { pixel?: number }) {
  const [visible, setVisible] = useState(false);
  const [leftPct, setLeftPct] = useState(14);
  const [msg, setMsg] = useState("Woof!");
  const [hopping, setHopping] = useState(false);
  const hideTimer = useRef<number | undefined>(undefined);

  // Schedule random visits.
  useEffect(() => {
    let nextTimer: number;

    const appear = () => {
      setLeftPct(6 + Math.random() * 68);
      setMsg(MESSAGES[Math.floor(Math.random() * MESSAGES.length)]);
      setVisible(true);
      hideTimer.current = window.setTimeout(
        () => setVisible(false),
        4200 + Math.random() * 1600,
      );
      scheduleNext();
    };

    const scheduleNext = () => {
      nextTimer = window.setTimeout(appear, 32000 + Math.random() * 40000);
    };

    // First visit shortly after load.
    const first = window.setTimeout(appear, 9000);

    return () => {
      window.clearTimeout(first);
      window.clearTimeout(nextTimer);
      window.clearTimeout(hideTimer.current);
    };
  }, []);

  function onTap() {
    setMsg(MESSAGES[Math.floor(Math.random() * MESSAGES.length)]);
    setHopping(false);
    requestAnimationFrame(() => setHopping(true));
    window.setTimeout(() => setHopping(false), 640);
    // Stay a little longer when played with.
    window.clearTimeout(hideTimer.current);
    setVisible(true);
    hideTimer.current = window.setTimeout(() => setVisible(false), 4000);
  }

  const px = (n: number) => n * pixel;

  return (
    <div
      aria-hidden={!visible}
      className={`cleia-wrap pointer-events-none fixed bottom-[calc(env(safe-area-inset-bottom)+84px)] z-40 ${
        visible ? "cleia-shown" : "cleia-hidden"
      }`}
      style={{ left: `${leftPct}%` }}
    >
      <div className="relative flex flex-col items-center">
        {/* speech bubble */}
        <div className="glass squish-shadow speech-pop mb-1 whitespace-nowrap rounded-2xl px-2.5 py-1 text-xs font-bold text-[var(--foreground)]">
          {msg}
        </div>
        <div className="glass -mt-1.5 mb-0.5 h-2.5 w-2.5 rotate-45 rounded-[2px]" />

        <button
          type="button"
          onClick={onTap}
          aria-label="Cleia the cavapoo — woof!"
          className={`pointer-events-auto cursor-pointer bg-transparent p-0 ${
            hopping ? "cleia-hop" : "cleia-bob"
          }`}
        >
          <svg
            width={px(GRID_W)}
            height={px(GRID_H)}
            viewBox={`0 0 ${GRID_W} ${GRID_H}`}
            shapeRendering="crispEdges"
            style={{ imageRendering: "pixelated", display: "block" }}
            role="img"
          >
            {/* wagging tail (behind body) */}
            <g className={visible ? "cleia-wag" : ""}>
              {TAIL.map(([x, y], i) => (
                <rect key={`t${i}`} x={x} y={y} width={1} height={1} fill={PALETTE.C} />
              ))}
            </g>
            {/* body */}
            {SPRITE.flatMap((row, y) =>
              row.split("").map((ch, x) => {
                const fill = PALETTE[ch];
                if (!fill) return null;
                return (
                  <rect
                    key={`${x}-${y}`}
                    x={x}
                    y={y}
                    width={1}
                    height={1}
                    fill={fill}
                  />
                );
              }),
            )}
          </svg>
        </button>
      </div>
    </div>
  );
}
