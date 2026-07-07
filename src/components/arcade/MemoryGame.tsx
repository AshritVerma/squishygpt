"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { GameProps } from "./types";

type Phase = "ready" | "playing" | "over";

interface Card {
  id: number;
  glyph: string;
  state: "down" | "up" | "matched";
}

// Optometry & Cleia themed pairs.
const GLYPHS = ["👁️", "👓", "🐶", "🦴", "🧋", "💊", "🩷", "🔬"];
const PAIRS = 8; // 4x4 grid

function shuffled(): Card[] {
  const deck = GLYPHS.slice(0, PAIRS)
    .flatMap((g) => [g, g])
    .map((glyph, i) => ({ id: i, glyph, state: "down" as const }));
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck.map((c, i) => ({ ...c, id: i }));
}

// Memory Match — flip cards, find the pairs. Score rewards accuracy and
// speed: 10 points per match, minus 1 per extra flip, plus a time bonus.
export function MemoryGame({ best, onGameOver, onExit }: GameProps) {
  const [phase, setPhase] = useState<Phase>("ready");
  const [cards, setCards] = useState<Card[]>(shuffled);
  const [moves, setMoves] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [finalScore, setFinalScore] = useState(0);

  const phaseRef = useRef<Phase>("ready");
  const lockRef = useRef(false);
  const upRef = useRef<number | null>(null);
  const movesRef = useRef(0);
  const secondsRef = useRef(0);
  const flipTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  // clock
  useEffect(() => {
    if (phase !== "playing") return;
    const iv = window.setInterval(() => {
      secondsRef.current += 1;
      setSeconds(secondsRef.current);
    }, 1000);
    return () => window.clearInterval(iv);
  }, [phase]);

  const start = useCallback(() => {
    window.clearTimeout(flipTimer.current);
    setCards(shuffled());
    setMoves(0);
    setSeconds(0);
    movesRef.current = 0;
    secondsRef.current = 0;
    upRef.current = null;
    lockRef.current = false;
    setPhase("playing");
    phaseRef.current = "playing";
  }, []);

  const finish = useCallback(
    (finalMoves: number) => {
      // 10 per pair, minus a point for every flip beyond the minimum,
      // plus up to 40 bonus for speed. Floor at PAIRS so a win never scores 0.
      const extra = Math.max(0, finalMoves - PAIRS);
      const timeBonus = Math.max(0, 40 - Math.floor(secondsRef.current / 3));
      const score = Math.max(PAIRS, PAIRS * 10 - extra + timeBonus);
      setFinalScore(score);
      onGameOver(score);
      setPhase("over");
    },
    [onGameOver],
  );

  const flip = (idx: number) => {
    if (phaseRef.current !== "playing" || lockRef.current) return;
    setCards((prev) => {
      const c = prev[idx];
      if (c.state !== "down") return prev;

      const next = prev.map((cc, i) =>
        i === idx ? { ...cc, state: "up" as const } : cc,
      );

      if (upRef.current === null) {
        upRef.current = idx;
        return next;
      }

      // second card of the pair
      const firstIdx = upRef.current;
      upRef.current = null;
      movesRef.current += 1;
      setMoves(movesRef.current);

      if (next[firstIdx].glyph === next[idx].glyph) {
        navigator.vibrate?.(8);
        const matched = next.map((cc, i) =>
          i === idx || i === firstIdx
            ? { ...cc, state: "matched" as const }
            : cc,
        );
        if (matched.every((cc) => cc.state === "matched")) {
          window.setTimeout(() => finish(movesRef.current), 350);
        }
        return matched;
      }

      // no match: flip both back after a beat
      lockRef.current = true;
      window.clearTimeout(flipTimer.current);
      flipTimer.current = window.setTimeout(() => {
        setCards((cur) =>
          cur.map((cc, i) =>
            i === idx || i === firstIdx ? { ...cc, state: "down" as const } : cc,
          ),
        );
        lockRef.current = false;
      }, 700);
      return next;
    });
  };

  useEffect(() => () => window.clearTimeout(flipTimer.current), []);

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden">
      {/* HUD */}
      <div className="flex items-center justify-between px-4 pt-3 text-sm">
        <span className="font-mono text-xs text-[var(--muted)]">
          {moves} moves · {seconds}s
        </span>
        <span className="font-mono text-[11px] text-[var(--muted)]">
          best {best}
        </span>
      </div>

      {/* 4x4 grid */}
      <div className="grid flex-1 grid-cols-4 content-center gap-2 p-4">
        {cards.map((c, i) => (
          <button
            key={c.id}
            onClick={() => flip(i)}
            disabled={c.state !== "down" && phase === "playing"}
            aria-label={c.state === "down" ? "Face-down card" : c.glyph}
            className={`memory-card aspect-square rounded-2xl text-3xl ${
              c.state === "down"
                ? "accent-gradient"
                : c.state === "matched"
                  ? "border border-emerald-400/40 bg-emerald-400/10 opacity-70"
                  : "glass squish-shadow"
            } ${c.state !== "down" ? "memory-flip" : ""}`}
          >
            {c.state === "down" ? (
              <span className="text-lg text-white/70">🐾</span>
            ) : (
              c.glyph
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
            Find all the pairs. Fewer flips and faster times score more 🧠
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
              {moves} moves · {seconds}s · Best {Math.max(best, finalScore)}
              {finalScore >= best && finalScore > 0 ? " · new best! 🎉" : ""}
            </p>
            <div className="mt-4 flex gap-2">
              <button
                onClick={start}
                className="accent-gradient spring rounded-2xl px-4 py-2 text-sm font-semibold text-white"
              >
                Play again
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
