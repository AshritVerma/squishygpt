"use client";

import { useEffect, useState } from "react";

interface Balloon {
  id: number;
  left: number; // vw %
  hue: string;
  size: number; // px
  dur: number; // s
  delay: number; // s
  gift: boolean;
}

const COLORS = ["#ec4899", "#a855f7", "#38bdf8", "#34d399", "#f472b6"];

const dayStamp = () => new Date().toISOString().slice(0, 10);
const DONE_KEY = () => `squishygpt.balloons.${dayStamp()}`;

function makeBalloons(): Balloon[] {
  const giftIdx = 2 + Math.floor(Math.random() * 3);
  return Array.from({ length: 6 }, (_, i) => ({
    id: i,
    left: 6 + i * 15 + Math.random() * 6,
    hue: COLORS[i % COLORS.length],
    size: 46 + Math.random() * 18,
    dur: 14 + Math.random() * 10,
    delay: i * 1.6,
    gift: i === giftIdx,
  }));
}

// Six balloons drift up the chat screen all birthday long. Tap to pop them —
// the golden one hides a note (and news of the paw-point gift). Popping all
// six earns a confetti blast; then they're done for the day.
export function BirthdayBalloons({ onOpenRecap }: { onOpenRecap: () => void }) {
  const [done, setDone] = useState(
    () => localStorage.getItem(DONE_KEY()) === "1",
  );
  const [balloons] = useState(makeBalloons);
  const [popped, setPopped] = useState<Set<number>>(new Set());
  const [bursts, setBursts] = useState<Balloon[]>([]);
  const [noteOpen, setNoteOpen] = useState(false);

  useEffect(() => {
    if (popped.size !== balloons.length || done) return;
    localStorage.setItem(DONE_KEY(), "1");
    window.dispatchEvent(new Event("squishy:confetti"));
    const t = window.setTimeout(() => setDone(true), 800);
    return () => window.clearTimeout(t);
  }, [popped, balloons.length, done]);

  const pop = (b: Balloon) => {
    if (popped.has(b.id)) return;
    navigator.vibrate?.(12);
    setPopped((prev) => new Set(prev).add(b.id));
    setBursts((prev) => [...prev, b]);
    window.setTimeout(
      () => setBursts((prev) => prev.filter((x) => x.id !== b.id)),
      600,
    );
    if (b.gift) setNoteOpen(true);
  };

  if (done) return null;

  return (
    <>
      <div
        className="pointer-events-none fixed inset-0 z-40 overflow-hidden"
        aria-hidden={false}
      >
        {balloons.map((b) =>
          popped.has(b.id) ? null : (
            <button
              key={b.id}
              data-testid={b.gift ? "gift-balloon" : "birthday-balloon"}
              aria-label={b.gift ? "Pop the golden balloon" : "Pop a balloon"}
              onClick={() => pop(b)}
              className="bday-balloon pointer-events-auto absolute"
              style={{
                left: `${b.left}%`,
                width: b.size,
                animationDuration: `${b.dur}s`,
                animationDelay: `${b.delay}s`,
              }}
            >
              <svg
                viewBox="0 0 60 90"
                width={b.size}
                height={b.size * 1.5}
                className="overflow-visible drop-shadow-md"
              >
                <path
                  d="M30 74 q4 8 0 14"
                  stroke="rgba(120,80,120,0.6)"
                  strokeWidth="1.5"
                  fill="none"
                />
                <ellipse
                  cx="30"
                  cy="36"
                  rx="24"
                  ry="32"
                  fill={b.gift ? "#ffd23f" : b.hue}
                />
                <ellipse
                  cx="22"
                  cy="24"
                  rx="7"
                  ry="11"
                  fill="rgba(255,255,255,0.35)"
                />
                <polygon
                  points="26,68 34,68 30,76"
                  fill={b.gift ? "#ffd23f" : b.hue}
                />
                {b.gift && (
                  <text
                    x="30"
                    y="42"
                    textAnchor="middle"
                    fontSize="20"
                  >
                    🎁
                  </text>
                )}
              </svg>
            </button>
          ),
        )}
        {bursts.map((b) => (
          <span
            key={`burst-${b.id}`}
            className="bday-burst absolute text-3xl"
            style={{ left: `${b.left}%`, top: "40%" }}
          >
            🎉
          </span>
        ))}
      </div>

      {noteOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setNoteOpen(false)}
          />
          <div
            data-testid="gift-balloon-note"
            className="glass squish-shadow bubble-in relative w-full max-w-sm rounded-3xl p-6 text-center"
          >
            <p className="text-4xl">🎁</p>
            <h3 className="mt-2 text-lg font-extrabold">You found it!!</h3>
            <p className="mt-2 text-[15px] leading-relaxed">
              Cleia hid <span className="font-bold accent-text">500 paw
              points</span> in this one — already in your Paw Shop. Your real
              present is waiting outside this app 😉
            </p>
            <p className="mt-2 text-sm text-[var(--muted)]">— Ashrit 💗</p>
            <button
              onClick={() => {
                setNoteOpen(false);
                onOpenRecap();
              }}
              className="accent-gradient spring mt-4 w-full rounded-2xl py-3 font-semibold text-white"
            >
              See your year in review 🎂
            </button>
            <button
              onClick={() => setNoteOpen(false)}
              className="mt-2 w-full rounded-2xl py-2 text-sm text-[var(--muted)]"
            >
              Back to the balloons
            </button>
          </div>
        </div>
      )}
    </>
  );
}
