"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Cleia — a bit-style pixel-art cavapoo who trots back and forth along the
// space above the chat bar. She chatters ("hi mommy!", "woof woof!") now and
// then, leans into the direction she's walking, and every so often hops up to
// bark. Tap her for an on-demand woof.

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

const CHATTER = ["hi mommy!", "woof woof!", "Woof!", "🐾 hi mommy 🐾", "woof!"];
const BARKS = ["Woof!", "woof woof!", "hi mommy!"];

const pick = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)];

export function CleiaDog({ pixel = 6 }: { pixel?: number }) {
  const [facingDir, setFacingDir] = useState(1); // +1 walking right, -1 left
  const [hopping, setHopping] = useState(false);
  const [bubble, setBubble] = useState<string | null>("hi mommy!");
  const [mounted, setMounted] = useState(false);

  const walkerRef = useRef<HTMLDivElement>(null);
  const posRef = useRef(28);
  const dirRef = useRef(1);
  const hoppingRef = useRef(false);
  const rafRef = useRef<number | undefined>(undefined);
  const bubbleTimer = useRef<number | undefined>(undefined);
  const hopTimer = useRef<number | undefined>(undefined);

  const dogW = GRID_W * pixel;

  useEffect(() => {
    hoppingRef.current = hopping;
  }, [hopping]);

  const say = useCallback((text: string) => {
    setBubble(text);
    window.clearTimeout(bubbleTimer.current);
    bubbleTimer.current = window.setTimeout(() => setBubble(null), 2600);
  }, []);

  const hop = useCallback(
    (text?: string) => {
      say(text ?? pick(BARKS));
      setHopping(false);
      requestAnimationFrame(() => setHopping(true));
      window.clearTimeout(hopTimer.current);
      hopTimer.current = window.setTimeout(() => setHopping(false), 640);
    },
    [say],
  );

  // Pacing loop: walk back and forth, pausing mid-stride only while hopping.
  useEffect(() => {
    setMounted(true);
    const reduce = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    const speed = 34; // px per second
    const bounds = () => {
      const min = 14;
      const max = Math.max(min + 60, window.innerWidth - dogW - 14);
      return { min, max };
    };

    const { min, max } = bounds();
    posRef.current = Math.min(Math.max(posRef.current, min), max);
    if (walkerRef.current) {
      walkerRef.current.style.transform = `translateX(${posRef.current}px)`;
    }

    let last = performance.now();
    const step = (t: number) => {
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      if (!reduce && !hoppingRef.current) {
        const b = bounds();
        posRef.current += dirRef.current * speed * dt;
        if (posRef.current <= b.min) {
          posRef.current = b.min;
          dirRef.current = 1;
          setFacingDir(1);
        } else if (posRef.current >= b.max) {
          posRef.current = b.max;
          dirRef.current = -1;
          setFacingDir(-1);
        }
        if (walkerRef.current) {
          walkerRef.current.style.transform = `translateX(${posRef.current}px)`;
        }
      }
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [dogW]);

  // Idle chatter + occasional hop-barks.
  useEffect(() => {
    let chatterT: number;
    let barkT: number;

    const scheduleChatter = () => {
      chatterT = window.setTimeout(
        () => {
          if (!hoppingRef.current) say(pick(CHATTER));
          scheduleChatter();
        },
        5000 + Math.random() * 6000,
      );
    };
    const scheduleBark = () => {
      barkT = window.setTimeout(
        () => {
          hop();
          scheduleBark();
        },
        9000 + Math.random() * 9000,
      );
    };

    scheduleChatter();
    scheduleBark();

    return () => {
      window.clearTimeout(chatterT);
      window.clearTimeout(barkT);
      window.clearTimeout(bubbleTimer.current);
      window.clearTimeout(hopTimer.current);
    };
  }, [say, hop]);

  const px = (n: number) => n * pixel;

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+84px)] z-40 overflow-visible"
    >
      <div
        ref={walkerRef}
        className={`absolute left-0 bottom-0 transition-opacity duration-700 ${
          mounted ? "opacity-100" : "opacity-0"
        }`}
        style={{ width: dogW }}
      >
        <div className="relative flex flex-col items-center">
          {/* speech bubble */}
          {bubble && (
            <>
              <div className="glass squish-shadow speech-pop mb-1 whitespace-nowrap rounded-2xl px-2.5 py-1 text-xs font-bold text-[var(--foreground)]">
                {bubble}
              </div>
              <div className="glass -mt-1.5 mb-0.5 h-2.5 w-2.5 rotate-45 rounded-[2px]" />
            </>
          )}
          {!bubble && <div className="mb-[26px]" />}

          {/* facing lean (rotates into the walk direction) */}
          <div
            style={{
              transform: `rotate(${facingDir * 3}deg)`,
              transition: "transform 260ms ease",
            }}
          >
            <button
              type="button"
              onClick={() => hop()}
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
                <g className="cleia-wag">
                  {TAIL.map(([x, y], i) => (
                    <rect
                      key={`t${i}`}
                      x={x}
                      y={y}
                      width={1}
                      height={1}
                      fill={PALETTE.C}
                    />
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
      </div>
    </div>
  );
}
