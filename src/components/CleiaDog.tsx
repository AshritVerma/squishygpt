"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  PALETTE,
  SPRITE,
  SLEEP_SPRITE,
  TAIL,
  CHARM_FILL,
  CHARM_COLOR,
  GRID_W,
  GRID_H,
} from "@/lib/cleiaSprite";

// Cleia — a bit-style pixel-art cavapoo who trots back and forth along the
// space above the chat bar and, every so often, takes a springy leap to a
// random spot somewhere on the page (mostly near the chat bar, occasionally
// way up high) before settling back down to pace again. She chatters
// ("hi mommy!", "woof woof!"), leans into the direction she's walking, and
// hops to bark. Tap her for an on-demand woof. Triple-tap opens the arcade.
// Her sprite data lives in src/lib/cleiaSprite.ts (shared with the games).

const CHATTER = ["hi mommy!", "woof woof!", "Woof!", "🐾 hi mommy 🐾", "woof!"];
const BARKS = ["Woof!", "woof woof!", "hi mommy!"];
// Extra-sappy lines while she's being pet.
const PET_LINES = [
  "i love you mommy!!",
  "aww 🥰",
  "best mommy!!",
  "🐾💕🐾",
  "pet me forever",
];
// Cheers when an answer finishes streaming.
const CELEBRATE = ["yay!! 🎉", "so smart mommy!!", "good job!! 🐾", "woohoo!"];

// ---- Seasonal accessories (drawn conditionally by date) ----
type HatDef = { palette: Record<string, string>; rows: string[] };

const PARTY_HAT: HatDef = {
  palette: { P: "#ec4899", O: "#a855f7", Y: "#ffd23f" },
  rows: ["   Y   ", "   P   ", "  POP  ", " PPOPP ", "PPPOPPP"],
};
const SANTA_HAT: HatDef = {
  palette: { R: "#e5484d", W: "#ffffff" },
  rows: [
    "     WW  ",
    "  RRRWW  ",
    " RRRRR   ",
    "RRRRRR   ",
    "WWWWWWWWW",
  ],
};
// Heart-shaped sunglasses over the eyes (Valentine's window).
const HEART_GLASSES: [number, number][] = [
  [3, 5], [5, 5], [3, 6], [4, 6], [5, 6], [4, 7],
  [9, 5], [11, 5], [9, 6], [10, 6], [11, 6], [10, 7],
  [6, 6], [7, 6], [8, 6],
];
const GLASSES_PINK = "#ff5fa2";

// Round rims she wears after swiping Squishy's glasses: a ring around each
// eye plus a bridge, in the same dark purple as Squishy's frames.
const STOLEN_GLASSES: [number, number][] = [
  [3, 5], [4, 5], [5, 5], [2, 6], [6, 6], [2, 7], [6, 7], [3, 8], [4, 8], [5, 8],
  [9, 5], [10, 5], [11, 5], [8, 6], [12, 6], [8, 7], [12, 7], [9, 8], [10, 8], [11, 8],
  [7, 6],
];
const GLASSES_PURPLE = "#46145a";
// How long she keeps them before giving them back.
const STEAL_MS = 10000;

type Accessory = "santa" | "party" | "hearts" | null;

function accessoryForToday(): Accessory {
  const d = new Date();
  const m = d.getMonth();
  const day = d.getDate();
  if (m === 11) return "santa"; // December
  if (m === 7 && day === 25) return "party"; // Serena's birthday
  if (m === 1 && day >= 7 && day <= 17) return "hearts"; // Valentine's window
  return null;
}

function isBirthday(): boolean {
  const d = new Date();
  return d.getMonth() === 7 && d.getDate() === 25;
}

function HatSprite({ hat, pixel }: { hat: HatDef; pixel: number }) {
  const w = hat.rows[0].length;
  const h = hat.rows.length;
  return (
    <svg
      width={w * pixel}
      height={h * pixel}
      viewBox={`0 0 ${w} ${h}`}
      shapeRendering="crispEdges"
      style={{ imageRendering: "pixelated", display: "block" }}
      aria-hidden
    >
      {hat.rows.flatMap((row, y) =>
        row.split("").map((ch, x) => {
          const fill = hat.palette[ch];
          if (!fill) return null;
          return (
            <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={fill} />
          );
        }),
      )}
    </svg>
  );
}

// Time-of-day flavored chatter, layered onto the base pool.
function chatterPool(): string[] {
  const now = new Date();
  const h = now.getHours();
  const extra: string[] = [];
  if (h < 9) extra.push("good morning mommy!", "did you sleep well? 🐾");
  if (h >= 0 && h < 5) extra.push("go to sleep 🐾", "it's late mommy…");
  if (now.getDay() === 5) extra.push("happy friday!!", "it's friyay 🎉");
  if (now.getMonth() === 7) extra.push("it's your birthday month!! 🎂");
  if (now.getMonth() === 7 && now.getDate() === 25)
    extra.push("HAPPY BIRTHDAY MOMMY!! 🎂🎉");
  return [...CHATTER, ...extra];
}

const pick = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)];

export function CleiaDog({ pixel = 6 }: { pixel?: number }) {
  const [facingDir, setFacingDir] = useState(1); // +1 walking right, -1 left
  const [hopping, setHopping] = useState(false);
  const [bubble, setBubble] = useState<string | null>("hi mommy!");
  const [mounted, setMounted] = useState(false);
  // Accessory + birthday mode are resolved after mount so the server and
  // client render the same initial markup (and so ?cleia= previews work).
  const [accessory, setAccessory] = useState<Accessory>(null);
  const [birthdayMode, setBirthdayMode] = useState(false);
  const [petting, setPetting] = useState(false);
  const [napping, setNapping] = useState(false);
  const [hearts, setHearts] = useState<number[]>([]);
  const [ball, setBall] = useState<{ x: number; y: number } | null>(null);
  const [sitting, setSitting] = useState(false);
  const [arcadeOpen, setArcadeOpen] = useState(false);
  const [stolenGlasses, setStolenGlasses] = useState(false);
  const stealingRef = useRef(false);
  const stealTimers = useRef<number[]>([]);
  const stealRef = useRef<() => void>(() => {});
  const tapTimes = useRef<number[]>([]);

  const walkerRef = useRef<HTMLDivElement>(null);
  const dogRef = useRef<HTMLButtonElement>(null);
  const fetchingRef = useRef(false);
  const fetchToRef = useRef<(x: number, y: number) => void>(() => {});
  const sittingRef = useRef(false);
  const sitToRef = useRef<() => void>(() => {});
  const posRef = useRef(28);
  const posYRef = useRef(0); // vertical offset; 0 = baseline above chat bar, negative = up the page
  const dirRef = useRef(1);
  const hoppingRef = useRef(false);
  const jumpingRef = useRef(false); // true while mid-leap (CSS transition owns transform)
  const pettingRef = useRef(false);
  const nappingRef = useRef(false);
  const lastActivityRef = useRef(0);
  const holdTimer = useRef<number | undefined>(undefined);
  const heartTimer = useRef<number | undefined>(undefined);
  const suppressClickRef = useRef(false);
  const jumpToRef = useRef<() => void>(() => {});
  const rafRef = useRef<number | undefined>(undefined);
  const bubbleTimer = useRef<number | undefined>(undefined);
  const hopTimer = useRef<number | undefined>(undefined);
  const jumpTimer = useRef<number | undefined>(undefined);
  const landTimer = useRef<number | undefined>(undefined);

  const dogW = GRID_W * pixel;
  const dogH = GRID_H * pixel;

  useEffect(() => {
    hoppingRef.current = hopping;
  }, [hopping]);
  useEffect(() => {
    pettingRef.current = petting;
  }, [petting]);
  useEffect(() => {
    nappingRef.current = napping;
  }, [napping]);
  useEffect(() => {
    sittingRef.current = sitting;
  }, [sitting]);

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

  // Wake from a nap with a little startled hop. Guarded so overlapping
  // wake triggers (tapping her + the global listener) only fire once.
  const wake = useCallback(() => {
    if (!nappingRef.current) return;
    nappingRef.current = false;
    setNapping(false);
    hop("!");
  }, [hop]);

  const spawnHeart = useCallback(() => {
    const id = Date.now() + Math.random();
    setHearts((h) => [...h, id]);
    window.setTimeout(() => setHearts((h) => h.filter((x) => x !== id)), 1000);
  }, []);

  const startPet = useCallback(() => {
    setPetting(true);
    say(pick(PET_LINES));
    navigator.vibrate?.(12);
    spawnHeart();
    window.clearInterval(heartTimer.current);
    heartTimer.current = window.setInterval(spawnHeart, 260);
  }, [say, spawnHeart]);

  const stopPet = useCallback(() => {
    setPetting(false);
    window.clearInterval(heartTimer.current);
  }, []);

  // Rare mischief: swipe Squishy's glasses, wear them for a bit, give them
  // back. Squishy squints and protests via the squishy:glasses event.
  const stealGlasses = useCallback(() => {
    if (stealingRef.current || nappingRef.current || pettingRef.current) return;
    stealingRef.current = true;
    setStolenGlasses(true);
    window.dispatchEvent(
      new CustomEvent("squishy:glasses", { detail: { stolen: true } }),
    );
    hop("hehehe!! 👓");
    stealTimers.current = [
      window.setTimeout(() => say("i'm smart now!!"), STEAL_MS * 0.45),
      window.setTimeout(() => {
        setStolenGlasses(false);
        window.dispatchEvent(
          new CustomEvent("squishy:glasses", { detail: { stolen: false } }),
        );
        say("fiiine, here you go");
        stealingRef.current = false;
      }, STEAL_MS),
    ];
  }, [hop, say]);
  useEffect(() => {
    stealRef.current = stealGlasses;
  }, [stealGlasses]);
  useEffect(
    () => () => {
      for (const t of stealTimers.current) window.clearTimeout(t);
    },
    [],
  );

  // Nap sync: let Squishy (and anyone else) know when she dozes off or wakes.
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("squishy:nap", { detail: { open: napping } }),
    );
  }, [napping]);

  // The steal can also be requested explicitly (previews, tests).
  useEffect(() => {
    const onSteal = () => stealRef.current();
    window.addEventListener("squishy:steal-request", onSteal);
    return () => window.removeEventListener("squishy:steal-request", onSteal);
  }, []);

  // Pacing loop: walk back and forth, pausing mid-stride while hopping or
  // mid-leap. A leap (see jumpToRef) hands transform control to a CSS
  // transition; the loop resumes once she's landed back at the baseline.
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

    const apply = (withTransition: boolean) => {
      if (!walkerRef.current) return;
      walkerRef.current.style.transition = withTransition
        ? "transform 720ms cubic-bezier(.34,1.56,.4,1)"
        : "none";
      walkerRef.current.style.transform = `translate(${posRef.current}px, ${posYRef.current}px)`;
    };

    const { min, max } = bounds();
    posRef.current = Math.min(Math.max(posRef.current, min), max);
    apply(false);

    // Leap to a random spot on the page, then settle back to the baseline.
    jumpToRef.current = () => {
      if (reduce || jumpingRef.current) return;
      const b = bounds();
      const targetX = b.min + Math.random() * (b.max - b.min);
      // Bias toward small hops near the chat bar; occasionally bound way up.
      const maxUp = Math.max(0, window.innerHeight - dogH - 120);
      const big = Math.random() < 0.4;
      const targetY = big
        ? -(Math.random() * maxUp)
        : -(Math.random() * Math.min(140, maxUp));

      jumpingRef.current = true;
      const dir = targetX >= posRef.current ? 1 : -1;
      dirRef.current = dir;
      setFacingDir(dir);
      posRef.current = targetX;
      posYRef.current = targetY;
      apply(true);
      hop(pick(BARKS));

      // Hang at the top of the leap, then drop back to the baseline.
      window.clearTimeout(jumpTimer.current);
      jumpTimer.current = window.setTimeout(() => {
        posYRef.current = 0;
        apply(true);
        window.clearTimeout(landTimer.current);
        landTimer.current = window.setTimeout(() => {
          jumpingRef.current = false;
        }, 740);
      }, 900);
    };

    // Fetch: sprint to a dropped ball (viewport coords), grab it, trot back.
    fetchToRef.current = (clientX: number, clientY: number) => {
      if (
        reduce ||
        jumpingRef.current ||
        fetchingRef.current ||
        nappingRef.current ||
        pettingRef.current
      )
        return;
      const el = dogRef.current;
      if (!el) return;
      // Map viewport coords into the walker's transform space by measuring
      // the dog's current on-screen box and subtracting the live translate.
      const rect = el.getBoundingClientRect();
      const zeroLeft = rect.left - posRef.current;
      const zeroTop = rect.top - posYRef.current;
      const b = bounds();
      const targetX = Math.min(
        Math.max(clientX - dogW / 2 - zeroLeft, b.min),
        b.max,
      );
      const targetY = Math.min(0, clientY - dogH / 2 - zeroTop);

      fetchingRef.current = true;
      jumpingRef.current = true;
      const savedX = posRef.current;
      const dir = targetX >= posRef.current ? 1 : -1;
      dirRef.current = dir;
      setFacingDir(dir);
      posRef.current = targetX;
      posYRef.current = targetY;
      apply(true);
      hop("i got it!!");

      window.setTimeout(() => {
        setBall(null);
        say("got it!! 🎾");
        setFacingDir(savedX >= targetX ? 1 : -1);
        posRef.current = savedX;
        posYRef.current = 0;
        apply(true);
        window.setTimeout(() => {
          fetchingRef.current = false;
          jumpingRef.current = false;
        }, 760);
      }, 800);
    };

    // Trot to the middle and sit, watching the answer stream in.
    sitToRef.current = () => {
      if (reduce || jumpingRef.current || fetchingRef.current) return;
      const b = bounds();
      const centerX = (b.min + b.max) / 2;
      dirRef.current = centerX >= posRef.current ? 1 : -1;
      setFacingDir(dirRef.current);
      posRef.current = centerX;
      posYRef.current = 0;
      apply(true);
    };

    let last = performance.now();
    const step = (t: number) => {
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      if (
        !reduce &&
        !hoppingRef.current &&
        !jumpingRef.current &&
        !nappingRef.current &&
        !pettingRef.current &&
        !sittingRef.current
      ) {
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
        apply(false);
      }
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      window.clearTimeout(jumpTimer.current);
      window.clearTimeout(landTimer.current);
    };
  }, [dogW, dogH, hop]);

  // Idle chatter + occasional random leaps across the page.
  useEffect(() => {
    let chatterT: number;
    let jumpT: number;

    const scheduleChatter = () => {
      chatterT = window.setTimeout(
        () => {
          if (
            !hoppingRef.current &&
            !jumpingRef.current &&
            !nappingRef.current &&
            !pettingRef.current
          ) {
            // Roughly 1-in-50 chatter ticks she steals Squishy's glasses.
            if (Math.random() < 0.02) stealRef.current();
            else say(pick(chatterPool()));
          }
          scheduleChatter();
        },
        5000 + Math.random() * 6000,
      );
    };
    const scheduleJump = () => {
      jumpT = window.setTimeout(
        () => {
          if (!nappingRef.current && !pettingRef.current) jumpToRef.current();
          scheduleJump();
        },
        5000 + Math.random() * 6000,
      );
    };

    scheduleChatter();
    scheduleJump();

    return () => {
      window.clearTimeout(chatterT);
      window.clearTimeout(jumpT);
      window.clearTimeout(bubbleTimer.current);
      window.clearTimeout(hopTimer.current);
    };
  }, [say]);

  // Sleepiness: after a couple minutes of no interaction she lies down for a
  // nap; any pointer or key activity wakes her with a startled hop.
  useEffect(() => {
    const IDLE_MS = 120000;
    lastActivityRef.current = Date.now();
    const reg = () => {
      lastActivityRef.current = Date.now();
      if (nappingRef.current) wake();
    };
    window.addEventListener("pointerdown", reg);
    window.addEventListener("keydown", reg);
    const iv = window.setInterval(() => {
      if (
        !nappingRef.current &&
        !pettingRef.current &&
        !jumpingRef.current &&
        Date.now() - lastActivityRef.current > IDLE_MS
      ) {
        setNapping(true);
      }
    }, 5000);
    return () => {
      window.removeEventListener("pointerdown", reg);
      window.removeEventListener("keydown", reg);
      window.clearInterval(iv);
      window.clearInterval(heartTimer.current);
      window.clearTimeout(holdTimer.current);
    };
  }, [wake]);

  // Fetch: tap an empty area of the page and Cleia runs to grab the ball.
  // Ignore taps on interactive/content surfaces so it only fires on open space.
  useEffect(() => {
    const IGNORE =
      'button, a, input, textarea, select, label, summary, [role="button"], [contenteditable], form, header, aside, .glass, .accent-gradient, svg';
    const onDown = (e: PointerEvent) => {
      if (
        fetchingRef.current ||
        jumpingRef.current ||
        nappingRef.current ||
        pettingRef.current
      )
        return;
      if (e.button && e.button !== 0) return;
      const t = e.target as HTMLElement | null;
      if (!t || t.closest(IGNORE)) return;
      setBall({ x: e.clientX, y: e.clientY });
      fetchToRef.current(e.clientX, e.clientY);
    };
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, []);

  // Resolve today's accessory + birthday mode once mounted. A ?cleia= query
  // param forces a look for previewing: santa | party | hearts | birthday
  // (and nap | feral to demo those states).
  useEffect(() => {
    const o = new URLSearchParams(window.location.search).get("cleia");
    const acc: Accessory =
      o === "santa" || o === "party" || o === "hearts"
        ? o
        : o === "birthday"
          ? "party"
          : accessoryForToday();
    setAccessory(acc);
    const bday = isBirthday() || o === "birthday";
    setBirthdayMode(bday);
    if (bday) setBubble("HAPPY BIRTHDAY MOMMY!! 🎂🎉");
    if (o === "nap") setNapping(true);
    if (o === "steal") {
      const t = window.setTimeout(() => stealRef.current(), 700);
      return () => window.clearTimeout(t);
    }
    if (o === "feral") {
      const t = window.setTimeout(
        () => window.dispatchEvent(new Event("squishy:feral")),
        700,
      );
      return () => window.clearTimeout(t);
    }
  }, []);

  // On her birthday, throw confetti and cheer shortly after load.
  useEffect(() => {
    if (!birthdayMode) return;
    const t = window.setTimeout(() => {
      window.dispatchEvent(new Event("squishy:confetti"));
      hop("HAPPY BIRTHDAY!! 🎉");
    }, 900);
    return () => window.clearTimeout(t);
  }, [birthdayMode, hop]);

  // Secret words / confetti reactions from the chat.
  useEffect(() => {
    const feralLines = [
      "woof woof woof!!",
      "🐾🐾🐾",
      "i love you!!",
      "ZOOMIES!!",
      "woooof!",
    ];
    const onFeral = () => {
      if (nappingRef.current) wake();
      let n = 0;
      const iv = window.setInterval(() => {
        hop(pick(feralLines));
        spawnHeart();
        spawnHeart();
        if (++n >= 6) window.clearInterval(iv);
      }, 360);
    };
    const onConfetti = () => {
      if (nappingRef.current) wake();
      hop("so smart mommy!!");
    };
    window.addEventListener("squishy:feral", onFeral);
    window.addEventListener("squishy:confetti", onConfetti);
    return () => {
      window.removeEventListener("squishy:feral", onFeral);
      window.removeEventListener("squishy:confetti", onConfetti);
    };
  }, [hop, wake, spawnHeart]);

  // Step aside (hide) while the arcade overlay is open.
  useEffect(() => {
    const onArcade = (e: Event) => {
      const open = (e as CustomEvent<{ open: boolean }>).detail?.open ?? false;
      setArcadeOpen(open);
    };
    window.addEventListener("squishy:arcade", onArcade as EventListener);
    return () =>
      window.removeEventListener("squishy:arcade", onArcade as EventListener);
  }, []);

  // While Claude streams a reply, Cleia trots to the middle and watches;
  // when it finishes she does a happy little cheer-hop.
  useEffect(() => {
    const onStart = () => {
      if (nappingRef.current) wake();
      setSitting(true);
      sitToRef.current();
    };
    const onDone = () => {
      setSitting(false);
      hop(pick(CELEBRATE));
    };
    window.addEventListener("squishy:answer-start", onStart);
    window.addEventListener("squishy:answer-done", onDone);
    return () => {
      window.removeEventListener("squishy:answer-start", onStart);
      window.removeEventListener("squishy:answer-done", onDone);
    };
  }, [hop, wake]);

  const px = (n: number) => n * pixel;
  const activeSprite = napping ? SLEEP_SPRITE : SPRITE;
  const bodyClass = napping
    ? "cleia-sleep"
    : hopping
      ? "cleia-hop"
      : sitting
        ? ""
        : "cleia-bob";
  const wagClass = napping ? "" : petting ? "cleia-wag-fast" : "cleia-wag";

  const beginHold = () => {
    lastActivityRef.current = Date.now();
    if (nappingRef.current) {
      wake();
      return;
    }
    window.clearTimeout(holdTimer.current);
    holdTimer.current = window.setTimeout(startPet, 350);
  };
  const endHold = () => {
    window.clearTimeout(holdTimer.current);
    if (pettingRef.current) {
      stopPet();
      suppressClickRef.current = true;
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 350);
    }
  };
  const onTap = () => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    if (nappingRef.current) {
      wake();
      return;
    }
    // Triple-tap within 1.2s opens the arcade.
    const now = Date.now();
    tapTimes.current = [...tapTimes.current.filter((t) => now - t < 1200), now];
    if (tapTimes.current.length >= 3) {
      tapTimes.current = [];
      say("wanna play?!");
      navigator.vibrate?.(20);
      window.dispatchEvent(new Event("squishy:arcade-request"));
      return;
    }
    hop();
    navigator.vibrate?.(8);
  };

  return (
    <div
      aria-hidden
      className={`pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+84px)] z-40 overflow-visible ${
        arcadeOpen ? "hidden" : ""
      }`}
    >
      {/* dropped tennis ball she runs to fetch */}
      {ball && (
        <div
          className="ball-drop pointer-events-none fixed z-30 h-3 w-3 rounded-full"
          style={{
            left: ball.x - 6,
            top: ball.y - 6,
            background: "radial-gradient(circle at 35% 30%, #eaff6b, #b6d94a)",
            boxShadow: "inset -1px -1px 0 rgba(0,0,0,.15), 0 1px 2px rgba(0,0,0,.2)",
          }}
        />
      )}
      <div
        ref={walkerRef}
        className={`absolute left-0 bottom-0 transition-opacity duration-700 ${
          mounted ? "opacity-100" : "opacity-0"
        }`}
        style={{ width: dogW }}
      >
        <div className="relative flex flex-col items-center">
          {/* floating hearts while she's being pet */}
          {hearts.map((id, i) => (
            <span
              key={id}
              className="heart-up pointer-events-none absolute bottom-8 text-sm"
              style={{ left: `${(i % 3) * 12 - 12}px` }}
            >
              {i % 2 === 0 ? "🩷" : "💕"}
            </span>
          ))}

          {/* speech / sleepy bubble */}
          {napping ? (
            <>
              <div className="glass squish-shadow cleia-zzz mb-1 whitespace-nowrap rounded-2xl px-2.5 py-1 text-xs font-bold text-[var(--muted)]">
                z z z 💤
              </div>
              <div className="glass -mt-1.5 mb-0.5 h-2.5 w-2.5 rotate-45 rounded-[2px]" />
            </>
          ) : bubble ? (
            <>
              <div className="glass squish-shadow speech-pop mb-1 whitespace-nowrap rounded-2xl px-2.5 py-1 text-xs font-bold text-[var(--foreground)]">
                {bubble}
              </div>
              <div className="glass -mt-1.5 mb-0.5 h-2.5 w-2.5 rotate-45 rounded-[2px]" />
            </>
          ) : (
            <div className="mb-[26px]" />
          )}

          {/* facing lean (rotates into the walk direction) */}
          <div
            style={{
              transform: `rotate(${napping ? 0 : facingDir * 3}deg)`,
              transition: "transform 260ms ease",
            }}
          >
            <button
              ref={dogRef}
              type="button"
              onClick={onTap}
              onPointerDown={beginHold}
              onPointerUp={endHold}
              onPointerLeave={endHold}
              onPointerCancel={endHold}
              aria-label="Cleia the cavapoo — tap to woof, hold to pet"
              style={{ touchAction: "none" }}
              className={`pointer-events-auto relative cursor-pointer bg-transparent p-0 ${bodyClass}`}
            >
              {(accessory === "santa" || accessory === "party") && (
                <div
                  className="pointer-events-none absolute left-1/2 -translate-x-1/2"
                  style={{ bottom: `calc(100% - ${px(3)}px)` }}
                >
                  <HatSprite
                    hat={accessory === "santa" ? SANTA_HAT : PARTY_HAT}
                    pixel={pixel}
                  />
                </div>
              )}
              <svg
                width={px(GRID_W)}
                height={px(GRID_H)}
                viewBox={`0 0 ${GRID_W} ${GRID_H}`}
                shapeRendering="crispEdges"
                style={{ imageRendering: "pixelated", display: "block" }}
                role="img"
              >
                {/* wagging tail (behind body) */}
                <g className={wagClass}>
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
                {activeSprite.flatMap((row, y) =>
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
                {/* gold "C" charm hanging from her collar */}
                {CHARM_FILL.map(([x, y]) => (
                  <rect
                    key={`cf${x}-${y}`}
                    x={x}
                    y={y}
                    width={1}
                    height={1}
                    fill={CHARM_COLOR}
                  />
                ))}
                {/* heart sunglasses (Valentine's) */}
                {accessory === "hearts" &&
                  HEART_GLASSES.map(([x, y]) => (
                    <rect
                      key={`hg${x}-${y}`}
                      x={x}
                      y={y}
                      width={1}
                      height={1}
                      fill={GLASSES_PINK}
                    />
                  ))}
                {/* Squishy's stolen glasses */}
                {stolenGlasses && (
                  <g data-cleia-glasses>
                    {STOLEN_GLASSES.map(([x, y]) => (
                      <rect
                        key={`sg${x}-${y}`}
                        x={x}
                        y={y}
                        width={1}
                        height={1}
                        fill={GLASSES_PURPLE}
                      />
                    ))}
                  </g>
                )}
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
