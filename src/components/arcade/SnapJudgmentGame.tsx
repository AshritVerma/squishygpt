"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { GameProps } from "./types";
import {
  CardPic,
  fetchImageCards,
  OverOverlay,
  preloadImages,
  StartOverlay,
  type ImageCard,
} from "./imageCards";

type Phase = "ready" | "playing" | "over";
type Status = "loading" | "ready" | "empty" | "error";

interface Round {
  card: ImageCard;
  shown: string;
  isTrue: boolean;
}

const ROUND_SECS = 45;
const BATCH = 16;
const REFILL_AT = 6;
const STREAK_AT = 5;

function toRound(card: ImageCard): Round {
  const isTrue = Math.random() < 0.5;
  const wrong = card.choices.filter((c) => c !== card.term);
  const shown = isTrue
    ? card.term
    : wrong[Math.floor(Math.random() * wrong.length)] ?? card.term;
  return { card, shown, isTrue: shown === card.term };
}

// Snap Judgment — 45 seconds of "is this picture <term>?" from Serena's cards.
// +10 a call (+5 on a 5+ streak), −5 for a wrong one, which also shows the
// real answer for a moment (the clock keeps running).
export function SnapJudgmentGame({ best, onGameOver, onExit }: GameProps) {
  const [status, setStatus] = useState<Status>("loading");
  const [phase, setPhase] = useState<Phase>("ready");
  const [rounds, setRounds] = useState<Round[]>([]);
  const [pos, setPos] = useState(0);
  const [timeLeft, setTimeLeft] = useState(ROUND_SECS);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [calls, setCalls] = useState({ right: 0, total: 0 });
  const [feedback, setFeedback] = useState<"right" | "wrong" | null>(null);

  const phaseRef = useRef<Phase>("ready");
  const scoreRef = useRef(0);
  const streakRef = useRef(0);
  const deadline = useRef(0);
  const refilling = useRef(false);
  const fbTimer = useRef<number | undefined>(undefined);

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const cards = await fetchImageCards(BATCH);
      if (cards.length === 0) {
        setStatus("empty");
        return false;
      }
      await preloadImages(cards.slice(0, 2));
      void preloadImages(cards.slice(2));
      setRounds(cards.map(toRound));
      setPos(0);
      setStatus("ready");
      return true;
    } catch {
      setStatus("error");
      return false;
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch
    void load();
    return () => window.clearTimeout(fbTimer.current);
  }, [load]);

  const begin = useCallback(() => {
    scoreRef.current = 0;
    streakRef.current = 0;
    setScore(0);
    setStreak(0);
    setCalls({ right: 0, total: 0 });
    setFeedback(null);
    setTimeLeft(ROUND_SECS);
    deadline.current = performance.now() + ROUND_SECS * 1000;
    phaseRef.current = "playing";
    setPhase("playing");
  }, []);

  // clock
  useEffect(() => {
    if (phase !== "playing") return;
    const iv = window.setInterval(() => {
      const left = Math.max(0, (deadline.current - performance.now()) / 1000);
      setTimeLeft(left);
      if (left <= 0) {
        window.clearInterval(iv);
        window.clearTimeout(fbTimer.current);
        phaseRef.current = "over";
        setPhase("over");
        onGameOver(scoreRef.current);
      }
    }, 100);
    return () => window.clearInterval(iv);
  }, [phase, onGameOver]);

  // Keep a few rounds queued so a fast player never waits on the network.
  useEffect(() => {
    if (phase !== "playing" || refilling.current) return;
    if (rounds.length - pos > REFILL_AT) return;
    refilling.current = true;
    fetchImageCards(BATCH)
      .then((cards) => {
        void preloadImages(cards);
        setRounds((cur) => {
          const have = new Set(cur.map((r) => r.card.imageId));
          return [
            ...cur,
            ...cards.filter((c) => !have.has(c.imageId)).map(toRound),
          ];
        });
      })
      .catch(() => {})
      .finally(() => {
        refilling.current = false;
      });
  }, [phase, pos, rounds.length]);

  const round = rounds[pos];

  const answer = useCallback(
    (saysTrue: boolean) => {
      if (phaseRef.current !== "playing" || feedback || !round) return;
      const right = saysTrue === round.isTrue;
      if (right) {
        streakRef.current += 1;
        scoreRef.current += 10 + (streakRef.current >= STREAK_AT ? 5 : 0);
        navigator.vibrate?.(8);
      } else {
        streakRef.current = 0;
        scoreRef.current = Math.max(0, scoreRef.current - 5);
        navigator.vibrate?.([20, 40, 20]);
      }
      setScore(scoreRef.current);
      setStreak(streakRef.current);
      setCalls((c) => ({ right: c.right + (right ? 1 : 0), total: c.total + 1 }));
      setFeedback(right ? "right" : "wrong");
      fbTimer.current = window.setTimeout(
        () => {
          setFeedback(null);
          setPos((p) => p + 1);
        },
        right ? 350 : 1300,
      );
    },
    [feedback, round],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") answer(true);
      if (e.key === "ArrowLeft") answer(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [answer]);

  const ring =
    feedback === "right"
      ? "ring-4 ring-emerald-400/70"
      : feedback === "wrong"
        ? "ring-4 ring-rose-400/70"
        : "";

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden">
      <div className="flex items-center justify-between px-4 pt-3 text-sm">
        <span className="font-mono text-xs text-[var(--muted)]">
          ⏱ {Math.ceil(timeLeft)}s
          {streak >= STREAK_AT ? ` · 🔥 ${streak}` : ""}
        </span>
        <span className="font-mono text-xs text-[var(--muted)]">
          <span className="font-bold text-[var(--accent)]">{score}</span> · best{" "}
          {best}
        </span>
      </div>
      <div className="mx-4 mt-2 h-1 overflow-hidden rounded-full bg-[var(--accent)]/10">
        <div
          className="accent-gradient h-full transition-[width] duration-100 ease-linear"
          style={{ width: `${(timeLeft / ROUND_SECS) * 100}%` }}
        />
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
        {round ? (
          <CardPic
            imageId={round.card.imageId}
            className={`min-h-0 flex-1 transition-shadow ${ring}`}
          />
        ) : (
          <div className="min-h-0 flex-1 animate-pulse rounded-2xl bg-[var(--accent)]/10" />
        )}
        <div className="min-h-16 text-center">
          {feedback === "wrong" && round ? (
            <p className="text-sm font-semibold leading-snug">
              <span className="text-rose-500">
                {round.isTrue ? "It was!" : "Nope, it's"}
              </span>{" "}
              {round.card.term}
            </p>
          ) : (
            <p className="text-sm leading-snug">
              <span className="text-[var(--muted)]">Is this</span>{" "}
              <span className="font-bold">{round?.shown ?? "…"}</span>
              <span className="text-[var(--muted)]">?</span>
            </p>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => answer(false)}
            disabled={!!feedback}
            className="spring glass squish-shadow rounded-2xl py-4 text-lg font-bold text-rose-500"
          >
            ✗ Nope
          </button>
          <button
            onClick={() => answer(true)}
            disabled={!!feedback}
            className="spring glass squish-shadow rounded-2xl py-4 text-lg font-bold text-emerald-500"
          >
            ✓ Yes
          </button>
        </div>
      </div>

      {phase === "ready" && (
        <StartOverlay
          status={status}
          onStart={begin}
          hint={`${ROUND_SECS} seconds. Is the picture what it says? Wrong calls cost 5 and show you the real answer ⚡`}
        />
      )}

      {phase === "over" && (
        <OverOverlay
          score={score}
          best={best}
          detail={`${calls.right}/${calls.total} right`}
          onRetry={() => {
            phaseRef.current = "ready";
            setPhase("ready");
            void load().then((ok) => ok && begin());
          }}
          onExit={onExit}
        />
      )}
    </div>
  );
}
