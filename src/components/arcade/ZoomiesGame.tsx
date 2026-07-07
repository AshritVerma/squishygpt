"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PALETTE, SPRITE, TAIL, CHARM_FILL, CHARM_COLOR, GRID_W, GRID_H } from "@/lib/cleiaSprite";
import type { GameProps } from "./types";

type Phase = "ready" | "playing" | "over";
type Occupant = "cleia" | "grape" | null;

interface Hole {
  occupant: Occupant;
  // when the current occupant hides on its own (epoch ms)
  hideAt: number;
  // pop-out animation key so re-pops re-trigger the CSS animation
  popKey: number;
}

const HOLES = 9;
const START_LIVES = 3;

// Small inline SVG render of the shared pixel sprite (the other games draw
// her on canvas; this one is DOM/grid based).
function CleiaSvg({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={(size * GRID_H) / GRID_W}
      viewBox={`0 0 ${GRID_W} ${GRID_H}`}
      shapeRendering="crispEdges"
      style={{ imageRendering: "pixelated", display: "block" }}
      aria-hidden
    >
      {TAIL.map(([x, y], i) => (
        <rect key={`t${i}`} x={x} y={y} width={1} height={1} fill={PALETTE.C} />
      ))}
      {SPRITE.flatMap((row, y) =>
        row.split("").map((ch, x) => {
          const fill = PALETTE[ch];
          if (!fill) return null;
          return (
            <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={fill} />
          );
        }),
      )}
      {CHARM_FILL.map(([x, y]) => (
        <rect key={`c${x}-${y}`} x={x} y={y} width={1} height={1} fill={CHARM_COLOR} />
      ))}
    </svg>
  );
}

// Zoomies — whack-a-Cleia. She pops out of holes with the zoomies; tap her
// before she dives back down. Grapes pop up too: tapping one costs a life,
// and letting Cleia escape costs nothing but points momentum. Three lives,
// speed ramps as your score climbs.
export function ZoomiesGame({ best, onGameOver, onExit }: GameProps) {
  const [phase, setPhase] = useState<Phase>("ready");
  const [holes, setHoles] = useState<Hole[]>(() =>
    Array.from({ length: HOLES }, () => ({
      occupant: null,
      hideAt: 0,
      popKey: 0,
    })),
  );
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(START_LIVES);
  const [finalScore, setFinalScore] = useState(0);
  const [flash, setFlash] = useState(false);

  const phaseRef = useRef<Phase>("ready");
  const scoreRef = useRef(0);
  const livesRef = useRef(START_LIVES);
  const holesRef = useRef(holes);
  const timersRef = useRef<number[]>([]);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);
  useEffect(() => {
    holesRef.current = holes;
  }, [holes]);

  const clearTimers = () => {
    for (const t of timersRef.current) window.clearTimeout(t);
    timersRef.current = [];
  };

  const endGame = useCallback(() => {
    clearTimers();
    setFinalScore(scoreRef.current);
    onGameOver(scoreRef.current);
    setPhase("over");
  }, [onGameOver]);

  // Difficulty ramp: how long an occupant stays up, and gap between spawns.
  const upTime = () => Math.max(650, 1400 - scoreRef.current * 12);
  const spawnGap = () => Math.max(380, 900 - scoreRef.current * 8);

  const scheduleSpawn = useCallback(function schedule() {
    if (phaseRef.current !== "playing") return;
    const t = window.setTimeout(() => {
      if (phaseRef.current !== "playing") return;
      const empty = holesRef.current
        .map((h, i) => (h.occupant === null ? i : -1))
        .filter((i) => i >= 0);
      if (empty.length > 0) {
        const idx = empty[Math.floor(Math.random() * empty.length)];
        const isGrape = Math.random() < 0.28;
        const stay = upTime() * (isGrape ? 1.15 : 1);
        setHoles((prev) =>
          prev.map((h, i) =>
            i === idx
              ? {
                  occupant: isGrape ? "grape" : "cleia",
                  hideAt: Date.now() + stay,
                  popKey: h.popKey + 1,
                }
              : h,
          ),
        );
        // auto-hide when its time is up
        const hideT = window.setTimeout(() => {
          setHoles((prev) =>
            prev.map((h, i) =>
              i === idx && Date.now() >= h.hideAt - 20
                ? { ...h, occupant: null }
                : h,
            ),
          );
        }, stay);
        timersRef.current.push(hideT);
      }
      schedule();
    }, spawnGap());
    timersRef.current.push(t);
  }, []);

  const start = useCallback(() => {
    clearTimers();
    setHoles(
      Array.from({ length: HOLES }, () => ({
        occupant: null,
        hideAt: 0,
        popKey: 0,
      })),
    );
    scoreRef.current = 0;
    livesRef.current = START_LIVES;
    setScore(0);
    setLives(START_LIVES);
    setPhase("playing");
    phaseRef.current = "playing";
    scheduleSpawn();
  }, [scheduleSpawn]);

  const whack = (idx: number) => {
    if (phaseRef.current !== "playing") return;
    const h = holesRef.current[idx];
    if (!h.occupant) return;
    if (h.occupant === "cleia") {
      scoreRef.current += 2;
      setScore(scoreRef.current);
      navigator.vibrate?.(8);
    } else {
      livesRef.current -= 1;
      setLives(livesRef.current);
      setFlash(true);
      window.setTimeout(() => setFlash(false), 220);
      navigator.vibrate?.(30);
    }
    setHoles((prev) =>
      prev.map((hh, i) => (i === idx ? { ...hh, occupant: null } : hh)),
    );
    if (livesRef.current <= 0) endGame();
  };

  // Pause/cleanup
  useEffect(() => {
    const onVis = () => {
      if (document.hidden && phaseRef.current === "playing") endGame();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      clearTimers();
    };
  }, [endGame]);

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden">
      {/* red flash on grape */}
      <div
        className={`pointer-events-none absolute inset-0 z-10 bg-rose-500/25 transition-opacity ${
          flash ? "opacity-100" : "opacity-0"
        }`}
      />

      {/* HUD */}
      <div className="flex items-center justify-between px-4 pt-3 text-sm">
        <span>
          {Array.from({ length: START_LIVES }, (_, i) => (
            <span key={i} className={i < lives ? "" : "opacity-25"}>
              🐾
            </span>
          ))}
        </span>
        <span className="font-mono font-bold text-[var(--accent)]">
          {score}
          <span className="ml-2 text-[11px] font-normal text-[var(--muted)]">
            best {Math.max(best, score)}
          </span>
        </span>
      </div>

      {/* 3x3 grid */}
      <div className="grid flex-1 grid-cols-3 gap-2 p-4">
        {holes.map((h, i) => (
          <button
            key={i}
            onPointerDown={() => whack(i)}
            aria-label={
              h.occupant === "cleia"
                ? "Tap Cleia!"
                : h.occupant === "grape"
                  ? "Don't tap the grape"
                  : "Empty hole"
            }
            className="relative flex items-end justify-center overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--accent)]/[0.06] pb-1"
          >
            {/* hole mouth */}
            <div className="pointer-events-none absolute bottom-1 left-1/2 h-3 w-4/5 -translate-x-1/2 rounded-[50%] bg-[var(--accent2,#a855f7)]/25" />
            {h.occupant && (
              <div key={h.popKey} className="zoomies-pop pointer-events-none">
                {h.occupant === "cleia" ? (
                  <CleiaSvg size={64} />
                ) : (
                  <span className="block pb-1 text-4xl leading-none">🍇</span>
                )}
              </div>
            )}
          </button>
        ))}
      </div>

      {phase === "ready" && (
        <div
          className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-1 bg-black/10 text-center backdrop-blur-[2px]"
          onPointerDown={start}
        >
          <p className="text-base font-bold">Tap to start</p>
          <p className="max-w-[240px] text-xs text-[var(--muted)]">
            Cleia has the zoomies! Tap her when she pops up — never tap the
            grapes 🍇
          </p>
        </div>
      )}

      {phase === "over" && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-black/20 text-center backdrop-blur-[2px]">
          <div className="glass squish-shadow rounded-2xl px-6 py-5">
            <p className="text-sm text-[var(--muted)]">Score</p>
            <p className="text-3xl font-extrabold">
              <span className="accent-text">{finalScore}</span>
            </p>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Best {Math.max(best, finalScore)}
              {finalScore >= best && finalScore > 0 ? " · new best! 🎉" : ""}
            </p>
            <div className="mt-4 flex gap-2">
              <button
                onClick={start}
                className="accent-gradient spring rounded-2xl px-4 py-2 text-sm font-semibold text-white"
              >
                Retry
              </button>
              <button
                onClick={onExit}
                className="spring rounded-2xl px-4 py-2 text-sm font-medium text-[var(--muted)] transition hover:bg-[var(--accent)]/10 hover:text-[var(--accent)]"
              >
                Menu
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
