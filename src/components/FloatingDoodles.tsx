// Ambient, non-interactive background layer of optometry-themed doodles that
// slowly drift around the page. Positions are fixed (no randomness) to avoid
// hydration mismatches. Sits behind content and ignores pointer events.

interface Doodle {
  char: string;
  top: string;
  left: string;
  size: number;
  opacity: number;
  anim: "doodle-a" | "doodle-b" | "doodle-c";
  duration: number;
  delay: number;
  snellen?: boolean;
}

const DOODLES: Doodle[] = [
  { char: "👁️", top: "12%", left: "8%", size: 30, opacity: 0.4, anim: "doodle-a", duration: 13, delay: 0 },
  { char: "👓", top: "22%", left: "88%", size: 34, opacity: 0.4, anim: "doodle-b", duration: 15, delay: 1.5 },
  { char: "🧠", top: "70%", left: "6%", size: 30, opacity: 0.35, anim: "doodle-c", duration: 17, delay: 0.8 },
  { char: "✨", top: "80%", left: "90%", size: 24, opacity: 0.5, anim: "doodle-a", duration: 11, delay: 2.2 },
  { char: "🩷", top: "40%", left: "94%", size: 22, opacity: 0.4, anim: "doodle-c", duration: 14, delay: 0.4 },
  { char: "👁️", top: "88%", left: "40%", size: 22, opacity: 0.3, anim: "doodle-b", duration: 16, delay: 3 },
  { char: "💫", top: "10%", left: "62%", size: 24, opacity: 0.4, anim: "doodle-c", duration: 12, delay: 1.1 },
  { char: "E", top: "32%", left: "4%", size: 34, opacity: 0.16, anim: "doodle-b", duration: 18, delay: 0.6, snellen: true },
  { char: "F", top: "58%", left: "92%", size: 40, opacity: 0.16, anim: "doodle-a", duration: 19, delay: 2.6, snellen: true },
  { char: "P", top: "6%", left: "30%", size: 28, opacity: 0.15, anim: "doodle-c", duration: 20, delay: 1.9, snellen: true },
  { char: "T", top: "50%", left: "50%", size: 30, opacity: 0.1, anim: "doodle-a", duration: 21, delay: 0.2, snellen: true },
  { char: "⭐", top: "66%", left: "74%", size: 20, opacity: 0.4, anim: "doodle-b", duration: 12, delay: 1.4 },
  { char: "👓", top: "84%", left: "14%", size: 26, opacity: 0.3, anim: "doodle-a", duration: 15, delay: 2.9 },
  { char: "O", top: "18%", left: "48%", size: 26, opacity: 0.12, anim: "doodle-b", duration: 22, delay: 0.9, snellen: true },
];

const SPARKLES = new Set(["✨", "💫", "⭐"]);

export function FloatingDoodles() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-[1] overflow-hidden"
    >
      {DOODLES.map((d, i) => (
        <span
          key={i}
          className="doodle"
          style={{
            top: d.top,
            left: d.left,
            fontSize: d.size,
            opacity: d.opacity,
            animationName: d.anim,
            animationDuration: `${d.duration}s`,
            animationDelay: `${d.delay}s`,
            animationTimingFunction: "ease-in-out",
            animationIterationCount: "infinite",
            ...(d.snellen
              ? {
                  fontWeight: 800,
                  fontFamily: "var(--font-geist-mono), monospace",
                  color: "var(--accent-2)",
                }
              : {}),
          }}
        >
          {SPARKLES.has(d.char) ? (
            <span
              className="twinkle"
              style={{ animationDelay: `${d.delay * 0.7}s` }}
            >
              {d.char}
            </span>
          ) : (
            d.char
          )}
        </span>
      ))}
    </div>
  );
}
