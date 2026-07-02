"use client";

import { useEffect, useRef, useState } from "react";

export type MascotMood = "idle" | "thinking" | "talking";

interface Props {
  size?: number;
  /** Show a little speech bubble above the mascot. */
  greeting?: string;
  /** Eyes follow the pointer (desktop) and gently wander (mobile). */
  interactive?: boolean;
  /** What Squishy is doing: thinking (eyes up + thought dots) or talking (mouth moves). */
  mood?: MascotMood;
}

/**
 * Squishy — the optometry brain mascot. A pink squishy brain wearing glasses,
 * with two big eyes that blink, a waving hand, blushing cheeks, and a gentle
 * bob. When interactive, the pupils track the pointer and wander when idle.
 * Moods make it react during chat: "thinking" looks up with thought bubbles,
 * "talking" animates the mouth while an answer streams in.
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

  // Eye behaviour: thinking looks up-left; otherwise track pointer / wander.
  useEffect(() => {
    const pupils = pupilsRef.current;
    if (!pupils) return;

    if (mood === "thinking") {
      pupils.style.transition = "transform 300ms ease";
      pupils.style.transform = "translate(-3.5px, -7px)";
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
  }, [interactive, mood]);

  // Wave periodically, and on tap.
  useEffect(() => {
    const id = setInterval(() => triggerWave(), 6500);
    return () => clearInterval(id);
  }, []);

  function triggerWave() {
    setWaving(false);
    // restart the animation on next frame
    requestAnimationFrame(() => setWaving(true));
    window.setTimeout(() => setWaving(false), 1700);
  }

  return (
    <div
      ref={wrapRef}
      className="relative inline-flex select-none items-center justify-center"
      style={{ width: size, height: size }}
    >
      {greeting && (
        <div className="speech-pop absolute -top-2 left-1/2 z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap">
          <div className="glass squish-shadow rounded-2xl px-3 py-1.5 text-sm font-semibold text-[var(--foreground)]">
            {greeting}
          </div>
          <div className="glass mx-auto -mt-1 h-3 w-3 rotate-45 rounded-[3px]" />
        </div>
      )}

      <svg
        viewBox="0 0 200 200"
        width={size}
        height={size}
        className="mascot-float cursor-pointer overflow-visible"
        onClick={triggerWave}
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

        {/* cheeks */}
        <circle className="mascot-cheek" cx="66" cy="126" r="9" fill="#ff8fc4" opacity="0.6" />
        <circle className="mascot-cheek" cx="134" cy="126" r="9" fill="#ff8fc4" opacity="0.6" />

        {/* eyes */}
        <g>
          <g className="mascot-eye">
            <ellipse cx="80" cy="108" rx="19" ry="21" fill="#ffffff" />
          </g>
          <g className="mascot-eye">
            <ellipse cx="120" cy="108" rx="19" ry="21" fill="#ffffff" />
          </g>
          {/* pupils track together */}
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
        </g>

        {/* glasses (an optometry brain must set a good example) */}
        <g>
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

        {/* mouth: talks while streaming, smiles otherwise */}
        {mood === "talking" ? (
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
