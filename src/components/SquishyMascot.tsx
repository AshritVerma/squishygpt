"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { mascotLevel, questionCount } from "@/lib/milestones";

export type MascotMood = "idle" | "thinking" | "talking";

/** Short-lived facial reactions (easter eggs). */
type Reaction = "stars" | "bashful" | "dizzy" | null;

interface Props {
  size?: number;
  /** Show a little speech bubble above the mascot. */
  greeting?: string;
  /** Eyes follow the pointer (desktop) and gently wander (mobile). */
  interactive?: boolean;
  /** What Squishy is doing: thinking (eyes up + thought dots) or talking (mouth moves). */
  mood?: MascotMood;
}

function starPath(cx: number, cy: number, R: number): string {
  const r = R * 0.45;
  let d = "";
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? R : r;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    d += `${i === 0 ? "M" : "L"}${(cx + rad * Math.cos(a)).toFixed(1)} ${(
      cy + rad * Math.sin(a)
    ).toFixed(1)}`;
  }
  return d + "Z";
}

const STAR_LEFT = starPath(80, 110, 9);
const STAR_RIGHT = starPath(120, 110, 9);
// A little spiral, spun via CSS while dizzy.
const SPIRAL = "a1.6 1.6 0 0 1 3.2 0 a3.2 3.2 0 0 1 -6.4 0 a5 5 0 0 1 10 0";

/**
 * Squishy — the optometry brain mascot. A pink squishy brain wearing glasses,
 * with two big eyes that blink, a waving hand, blushing cheeks, and a gentle
 * bob. When interactive, the pupils track the pointer and wander when idle.
 * Moods make it react during chat: "thinking" looks up with thought bubbles,
 * "talking" animates the mouth while an answer streams in.
 *
 * Easter eggs (all instances react to global squishy:* events):
 * - squishy:2020      → star eyes ("perfect vision!!")
 * - squishy:bashful   → blushing closed-eye bashful mode + wave
 * - squishy:nap       → drowsy lids + yawning while Cleia naps
 * - squishy:glasses   → squints while Cleia has stolen the glasses
 * - squishy:milestone → evolves: graduation cap at 250 questions, +stethoscope at 500
 * Local gestures: press-and-hold squishes it (boing on release); dragging a
 * couple of circles around it makes it dizzy.
 */
export function SquishyMascot({
  size = 160,
  greeting,
  interactive = true,
  mood = "idle",
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const pupilsRef = useRef<SVGGElement>(null);
  const [waving, setWaving] = useState(false);
  const [wiggling, setWiggling] = useState(false);
  const [idleTalking, setIdleTalking] = useState(false);
  const [reaction, setReaction] = useState<Reaction>(null);
  const [note, setNote] = useState<string | null>(null);
  const [drowsy, setDrowsy] = useState(false);
  const [glassesStolen, setGlassesStolen] = useState(false);
  const [squished, setSquished] = useState(false);
  const [boinging, setBoinging] = useState(false);
  const [level, setLevel] = useState<0 | 1 | 2>(0);

  const reactionTimer = useRef<number | undefined>(undefined);
  const noteTimer = useRef<number | undefined>(undefined);
  const holdTimer = useRef<number | undefined>(undefined);
  const boingTimer = useRef<number | undefined>(undefined);
  const squishedRef = useRef(false);
  const suppressClickRef = useRef(false);
  // circle-swipe accumulator
  const swipeAngle = useRef<number | null>(null);
  const swipeAccum = useRef(0);
  const swipeLastT = useRef(0);

  const say = useCallback((text: string) => {
    setNote(text);
    window.clearTimeout(noteTimer.current);
    noteTimer.current = window.setTimeout(() => setNote(null), 2600);
  }, []);

  const react = useCallback(
    (r: Exclude<Reaction, null>, text: string, ms: number) => {
      setReaction(r);
      say(text);
      window.clearTimeout(reactionTimer.current);
      reactionTimer.current = window.setTimeout(() => setReaction(null), ms);
    },
    [say],
  );

  // When left to its own devices, Squishy stays lively: it periodically
  // "chatters" (mouth moves), wiggles, or waves.
  const effectiveMood: MascotMood =
    mood !== "idle" ? mood : idleTalking ? "talking" : "idle";

  // Eye behaviour: thinking looks up-left, drowsy droops; otherwise track
  // pointer / wander.
  useEffect(() => {
    const pupils = pupilsRef.current;
    if (!pupils) return;

    if (mood === "thinking" || drowsy) {
      pupils.style.transition = "transform 300ms ease";
      pupils.style.transform = drowsy
        ? "translate(0px, 4px)"
        : "translate(-3.5px, -7px)";
      return () => {
        pupils.style.transition = "";
      };
    }

    if (!interactive) {
      pupils.style.transition = "transform 300ms ease";
      pupils.style.transform = "translate(0px, 0px)";
      return () => {
        pupils.style.transition = "";
      };
    }

    pupils.style.transition = "";
    let raf = 0;
    let curX = 0;
    let curY = 0;
    let tgtX = 0;
    let tgtY = 0;
    let lastMove = -Infinity;
    const maxR = 7; // in SVG user units

    function onMove(e: PointerEvent) {
      const el = wrapRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;
      const dist = Math.hypot(dx, dy) || 1;
      tgtX = (dx / dist) * maxR;
      tgtY = (dy / dist) * maxR;
      lastMove = performance.now();
    }

    function loop(t: number) {
      if (t - lastMove > 1800) {
        // Idle: eyes drift in a slow lissajous.
        tgtX = Math.cos(t / 950) * maxR * 0.7;
        tgtY = Math.sin(t / 1350) * maxR * 0.7;
      }
      curX += (tgtX - curX) * 0.12;
      curY += (tgtY - curY) * 0.12;
      if (pupilsRef.current) {
        pupilsRef.current.style.transform = `translate(${curX.toFixed(
          2,
        )}px, ${curY.toFixed(2)}px)`;
      }
      raf = requestAnimationFrame(loop);
    }

    window.addEventListener("pointermove", onMove);
    raf = requestAnimationFrame(loop);
    return () => {
      window.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(raf);
    };
  }, [interactive, mood, drowsy]);

  // Idle chatter: randomly talk, wiggle, or wave when not busy in a chat turn.
  useEffect(() => {
    if (mood !== "idle") return;
    let timer: number;
    const schedule = () => {
      timer = window.setTimeout(
        () => {
          const r = Math.random();
          if (r < 0.5) {
            setIdleTalking(true);
            window.setTimeout(
              () => setIdleTalking(false),
              1200 + Math.random() * 1200,
            );
          } else if (r < 0.8) {
            triggerWiggle();
          } else {
            triggerWave();
          }
          schedule();
        },
        2800 + Math.random() * 4000,
      );
    };
    schedule();
    return () => window.clearTimeout(timer);
  }, [mood]);

  // Milestone evolution: read the question count on mount, then upgrade live
  // (with an announcement) when Chat reports a milestone crossing.
  const levelRef = useRef<0 | 1 | 2>(0);
  useEffect(() => {
    const update = (announce: boolean) => {
      const next = mascotLevel(questionCount());
      if (announce && next > levelRef.current) {
        say(next === 2 ? "leveled up!! dr. squishy!! 🩺" : "leveled up!! 🎓");
        triggerWiggle();
        triggerWave();
      }
      levelRef.current = next;
      setLevel(next);
    };
    // Deferred so the mount read doesn't set state synchronously in the
    // effect (and the server/client first paint stays identical).
    const raf = requestAnimationFrame(() => update(false));
    const onMilestone = () => update(true);
    window.addEventListener("squishy:milestone", onMilestone);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("squishy:milestone", onMilestone);
    };
  }, [say]);

  // Global easter-egg reactions.
  useEffect(() => {
    const on2020 = () => react("stars", "perfect vision!! ✨", 2400);
    const onBashful = () => {
      react("bashful", "aww stop it 🥹", 2600);
      triggerWave();
    };
    const onNap = (e: Event) => {
      const open = (e as CustomEvent<{ open: boolean }>).detail?.open ?? false;
      setDrowsy(open);
      if (open) say("shh… cleia's sleeping 💤");
    };
    const onGlasses = (e: Event) => {
      const stolen =
        (e as CustomEvent<{ stolen: boolean }>).detail?.stolen ?? false;
      setGlassesStolen(stolen);
      if (stolen) say("hey!! give those back!!");
      else say("phew. much better 👓");
    };
    window.addEventListener("squishy:2020", on2020);
    window.addEventListener("squishy:bashful", onBashful);
    window.addEventListener("squishy:nap", onNap);
    window.addEventListener("squishy:glasses", onGlasses);
    return () => {
      window.removeEventListener("squishy:2020", on2020);
      window.removeEventListener("squishy:bashful", onBashful);
      window.removeEventListener("squishy:nap", onNap);
      window.removeEventListener("squishy:glasses", onGlasses);
    };
  }, [react, say]);

  useEffect(
    () => () => {
      window.clearTimeout(reactionTimer.current);
      window.clearTimeout(noteTimer.current);
      window.clearTimeout(holdTimer.current);
      window.clearTimeout(boingTimer.current);
    },
    [],
  );

  function triggerWave() {
    setWaving(false);
    requestAnimationFrame(() => setWaving(true));
    window.setTimeout(() => setWaving(false), 1700);
  }

  function triggerWiggle() {
    setWiggling(false);
    requestAnimationFrame(() => setWiggling(true));
    window.setTimeout(() => setWiggling(false), 720);
  }

  function onTap(e: React.MouseEvent) {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      // Don't let the release of a squish count as a click on whatever
      // wraps the mascot (the header one lives inside a link).
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    // A tap makes Squishy react with both a wave and a wiggle.
    triggerWave();
    triggerWiggle();
  }

  // --- Squish and hold ---
  const beginHold = () => {
    window.clearTimeout(holdTimer.current);
    holdTimer.current = window.setTimeout(() => {
      squishedRef.current = true;
      setSquished(true);
      setBoinging(false);
      navigator.vibrate?.(10);
    }, 260);
  };
  const endHold = () => {
    window.clearTimeout(holdTimer.current);
    if (!squishedRef.current) return;
    squishedRef.current = false;
    setSquished(false);
    setBoinging(true);
    say("boing!!");
    navigator.vibrate?.(8);
    window.clearTimeout(boingTimer.current);
    boingTimer.current = window.setTimeout(() => setBoinging(false), 600);
    // The release shouldn't also count as a tap.
    suppressClickRef.current = true;
    window.setTimeout(() => {
      suppressClickRef.current = false;
    }, 350);
  };

  // --- Konami-ish circle swipe: drag ~1.5 loops around Squishy → dizzy ---
  const onSwipeMove = (e: React.PointerEvent) => {
    const el = wrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const a = Math.atan2(
      e.clientY - (r.top + r.height / 2),
      e.clientX - (r.left + r.width / 2),
    );
    const now = performance.now();
    if (swipeAngle.current === null || now - swipeLastT.current > 500) {
      swipeAngle.current = a;
      swipeAccum.current = 0;
      swipeLastT.current = now;
      return;
    }
    let d = a - swipeAngle.current;
    if (d > Math.PI) d -= 2 * Math.PI;
    if (d < -Math.PI) d += 2 * Math.PI;
    // Ignore wild jumps (pointer crossing the center).
    if (Math.abs(d) < Math.PI / 2) swipeAccum.current += d;
    swipeAngle.current = a;
    swipeLastT.current = now;
    if (Math.abs(swipeAccum.current) > 3 * Math.PI && reaction !== "dizzy") {
      swipeAccum.current = 0;
      react("dizzy", "woah… so dizzy!!", 1900);
      triggerWiggle();
      navigator.vibrate?.(16);
    }
  };

  const squinting = glassesStolen && reaction === null;
  const showLids = drowsy && reaction === null && !squinting;

  return (
    <div
      ref={wrapRef}
      onPointerMove={onSwipeMove}
      data-squishy
      data-level={level}
      data-reaction={reaction ?? "none"}
      data-drowsy={drowsy ? "true" : "false"}
      data-glasses={glassesStolen ? "stolen" : "on"}
      data-squished={squished ? "true" : "false"}
      className="mascot-float relative inline-flex select-none items-center justify-center"
      style={{ width: size, height: size }}
    >
      {(note || greeting) && (
        <div className="speech-pop absolute -top-2 left-1/2 z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap">
          <div className="glass squish-shadow rounded-2xl px-3 py-1.5 text-sm font-semibold text-[var(--foreground)]">
            {note ?? greeting}
          </div>
          <div className="glass mx-auto -mt-1 h-3 w-3 rotate-45 rounded-[3px]" />
        </div>
      )}

      <svg
        viewBox="0 0 200 200"
        width={size}
        height={size}
        className={`mascot-squishable cursor-pointer overflow-visible ${
          wiggling ? "mascot-wiggle" : ""
        } ${squished ? "mascot-squished" : ""} ${boinging ? "mascot-boing" : ""}`}
        onClick={onTap}
        onPointerDown={beginHold}
        onPointerUp={endHold}
        onPointerLeave={endHold}
        onPointerCancel={endHold}
        style={{ touchAction: "none" }}
        role="img"
        aria-label="Squishy the optometry brain mascot"
      >
        <defs>
          <radialGradient id="squishBody" cx="38%" cy="30%" r="80%">
            <stop offset="0%" stopColor="#ffd6ec" />
            <stop offset="55%" stopColor="var(--accent)" />
            <stop offset="100%" stopColor="var(--accent-2)" />
          </radialGradient>
          <linearGradient id="squishIris" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#a855f7" />
            <stop offset="100%" stopColor="#6d28d9" />
          </linearGradient>
        </defs>

        {/* soft shadow */}
        <ellipse cx="100" cy="182" rx="46" ry="9" fill="rgba(120,40,120,0.15)" />

        {/* waving arm (behind body) */}
        <g className={`mascot-arm ${waving ? "waving" : ""}`}>
          <path
            d="M150 118 q26 -6 34 -28"
            stroke="url(#squishBody)"
            strokeWidth="11"
            strokeLinecap="round"
            fill="none"
          />
          <circle cx="186" cy="88" r="10" fill="url(#squishBody)" />
        </g>
        {/* left arm */}
        <path
          d="M50 118 q-24 -4 -30 -22"
          stroke="url(#squishBody)"
          strokeWidth="11"
          strokeLinecap="round"
          fill="none"
        />
        <circle cx="18" cy="94" r="9" fill="url(#squishBody)" />

        {/* body: squishy brain blob */}
        <path
          d="M100 34
             c34 0 60 22 60 54
             c0 10 -3 18 -8 25
             c4 8 2 20 -8 26
             c-8 6 -18 5 -24 1
             c-6 5 -14 7 -20 7
             c-6 0 -14 -2 -20 -7
             c-6 4 -16 5 -24 -1
             c-10 -6 -12 -18 -8 -26
             c-5 -7 -8 -15 -8 -25
             c0 -32 26 -54 60 -54 Z"
          fill="url(#squishBody)"
        />
        {/* brain gyri squiggles */}
        <g
          stroke="rgba(160,30,110,0.28)"
          strokeWidth="3"
          fill="none"
          strokeLinecap="round"
        >
          <path d="M100 40 v22" />
          <path d="M78 48 q10 8 0 18" />
          <path d="M122 48 q-10 8 0 18" />
          <path d="M66 70 q10 6 4 16" />
          <path d="M134 70 q-10 6 -4 16" />
        </g>

        {/* graduation cap (250-question milestone) */}
        {level >= 1 && (
          <g data-accessory="cap">
            <ellipse cx="100" cy="42" rx="23" ry="10" fill="#2f2144" />
            <polygon
              points="100,14 154,32 100,50 46,32"
              fill="#3b2a52"
              stroke="#241a3a"
              strokeWidth="2"
            />
            <circle cx="100" cy="32" r="3" fill="#ffd23f" />
            <path
              d="M100 32 L152 33 L153 52"
              stroke="#ffd23f"
              strokeWidth="2.5"
              fill="none"
              strokeLinecap="round"
            />
            <circle cx="153" cy="56" r="4" fill="#ffd23f" />
          </g>
        )}

        {/* cheeks — extra blush while bashful */}
        <circle
          className="mascot-cheek"
          cx="66"
          cy="126"
          r={reaction === "bashful" ? 12 : 9}
          fill="#ff8fc4"
          opacity={reaction === "bashful" ? 0.95 : 0.6}
        />
        <circle
          className="mascot-cheek"
          cx="134"
          cy="126"
          r={reaction === "bashful" ? 12 : 9}
          fill="#ff8fc4"
          opacity={reaction === "bashful" ? 0.95 : 0.6}
        />

        {/* eyes */}
        {reaction === "bashful" ? (
          // happy closed arcs
          <g
            stroke="#46145a"
            strokeWidth="4.5"
            strokeLinecap="round"
            fill="none"
          >
            <path d="M67 112 q13 -13 26 0" />
            <path d="M107 112 q13 -13 26 0" />
          </g>
        ) : (
          <g>
            <g className="mascot-eye">
              <ellipse
                cx="80"
                cy="108"
                rx="19"
                ry={squinting ? 8 : 21}
                fill="#ffffff"
              />
            </g>
            <g className="mascot-eye">
              <ellipse
                cx="120"
                cy="108"
                rx="19"
                ry={squinting ? 8 : 21}
                fill="#ffffff"
              />
            </g>
            {reaction === "stars" ? (
              <g fill="#ffd23f" stroke="#eaa800" strokeWidth="1.5">
                <path className="twinkle" d={STAR_LEFT} />
                <path className="twinkle" d={STAR_RIGHT} />
              </g>
            ) : reaction === "dizzy" ? (
              <g
                stroke="#6d28d9"
                strokeWidth="2.5"
                fill="none"
                strokeLinecap="round"
              >
                <path className="dizzy-eye" d={`M80 110 ${SPIRAL}`} />
                <path className="dizzy-eye" d={`M120 110 ${SPIRAL}`} />
              </g>
            ) : squinting ? (
              <g fill="#1c1030">
                <circle cx="80" cy="108" r="4" />
                <circle cx="120" cy="108" r="4" />
              </g>
            ) : (
              /* pupils track together */
              <g ref={pupilsRef}>
                <g>
                  <circle cx="80" cy="110" r="9" fill="url(#squishIris)" />
                  <circle cx="80" cy="110" r="4.5" fill="#1c1030" />
                  <circle cx="76" cy="106" r="2.6" fill="#ffffff" />
                </g>
                <g>
                  <circle cx="120" cy="110" r="9" fill="url(#squishIris)" />
                  <circle cx="120" cy="110" r="4.5" fill="#1c1030" />
                  <circle cx="116" cy="106" r="2.6" fill="#ffffff" />
                </g>
              </g>
            )}
            {/* drowsy lids droop over the top half of the eyes */}
            {showLids && (
              <g fill="url(#squishBody)">
                <ellipse cx="80" cy="97" rx="19.5" ry="12" />
                <ellipse cx="120" cy="97" rx="19.5" ry="12" />
              </g>
            )}
          </g>
        )}

        {/* glasses (an optometry brain must set a good example) — unless
            Cleia has made off with them */}
        {!glassesStolen && (
          <g
            className={`mascot-glasses ${squished ? "slid" : ""}`}
            data-part="glasses"
          >
            {/* temples */}
            <path
              d="M59 102 L42 95"
              stroke="rgba(70,20,90,0.85)"
              strokeWidth="4"
              strokeLinecap="round"
            />
            <path
              d="M141 102 L158 95"
              stroke="rgba(70,20,90,0.85)"
              strokeWidth="4"
              strokeLinecap="round"
            />
            {/* bridge */}
            <path
              d="M97 100 q3 -4 6 0"
              stroke="rgba(70,20,90,0.85)"
              strokeWidth="4"
              strokeLinecap="round"
              fill="none"
            />
            {/* lenses */}
            <ellipse
              cx="80"
              cy="108"
              rx="21"
              ry="23"
              fill="rgba(255,255,255,0.10)"
              stroke="rgba(70,20,90,0.85)"
              strokeWidth="4"
            />
            <ellipse
              cx="120"
              cy="108"
              rx="21"
              ry="23"
              fill="rgba(255,255,255,0.10)"
              stroke="rgba(70,20,90,0.85)"
              strokeWidth="4"
            />
            {/* glint sweeping across the left lens */}
            <line
              className="glasses-glint"
              x1="74"
              y1="94"
              x2="66"
              y2="120"
              stroke="rgba(255,255,255,0.85)"
              strokeWidth="3.5"
              strokeLinecap="round"
            />
          </g>
        )}

        {/* stethoscope (500-question milestone) */}
        {level >= 2 && (
          <g data-accessory="stethoscope">
            <path
              d="M72 138 q0 30 28 30 q28 0 28 -30"
              stroke="#46145a"
              strokeWidth="5"
              fill="none"
              strokeLinecap="round"
            />
            <circle
              cx="100"
              cy="169"
              r="8"
              fill="#ffd23f"
              stroke="#46145a"
              strokeWidth="3"
            />
          </g>
        )}

        {/* mouth: yawns while drowsy, talks while streaming, smiles otherwise */}
        {showLids ? (
          <ellipse
            className="mascot-yawn"
            cx="100"
            cy="144"
            rx="8"
            ry="9"
            fill="rgba(120,20,80,0.8)"
          />
        ) : effectiveMood === "talking" && reaction !== "bashful" ? (
          <ellipse
            className="mascot-mouth"
            cx="100"
            cy="143"
            rx="9"
            ry="7"
            fill="rgba(120,20,80,0.8)"
          />
        ) : (
          <path
            d="M86 140 q14 12 28 0"
            stroke="rgba(120,20,80,0.75)"
            strokeWidth="3.5"
            strokeLinecap="round"
            fill="none"
          />
        )}

        {/* thought bubbles while thinking */}
        {mood === "thinking" && (
          <g fill="var(--accent-2)">
            <circle className="think-dot" cx="146" cy="50" r="4" />
            <circle
              className="think-dot"
              cx="158"
              cy="36"
              r="5.5"
              style={{ animationDelay: "0.22s" }}
            />
            <circle
              className="think-dot"
              cx="172"
              cy="20"
              r="7"
              style={{ animationDelay: "0.44s" }}
            />
          </g>
        )}
      </svg>
    </div>
  );
}
