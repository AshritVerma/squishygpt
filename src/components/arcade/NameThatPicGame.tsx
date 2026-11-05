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

const ROUNDS = 10;
const STREAK_AT = 3;

// Name That Pic — one of Serena's card images, four terms from the same set.
// 10 points a hit, up to 10 more for answering fast, +5 while on a 3+ streak.
// A miss shows the right answer for a beat so every round teaches something.
export function NameThatPicGame({ best, onGameOver, onExit }: GameProps) {
  const [status, setStatus] = useState<Status>("loading");
  const [phase, setPhase] = useState<Phase>("ready");
  const [deck, setDeck] = useState<ImageCard[]>([]);
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [hits, setHits] = useState(0);

  const scoreRef = useRef(0);
  const streakRef = useRef(0);
  const hitsRef = useRef(0);
  const roundStart = useRef(0);
  const timer = useRef<number | undefined>(undefined);

  const begin = useCallback(() => {
    scoreRef.current = 0;
    streakRef.current = 0;
    hitsRef.current = 0;
    setScore(0);
    setStreak(0);
    setHits(0);
    setIdx(0);
    setPicked(null);
    roundStart.current = performance.now();
    setPhase("playing");
  }, []);

  const load = useCallback(
    async (autostart: boolean) => {
      window.clearTimeout(timer.current);
      setStatus("loading");
      setPhase("ready");
      try {
        const cards = await fetchImageCards(ROUNDS);
        if (cards.length === 0) return setStatus("empty");
        await preloadImages(cards.slice(0, 2));
        void preloadImages(cards.slice(2));
        setDeck(cards);
        setStatus("ready");
        if (autostart) begin();
      } catch {
        setStatus("error");
      }
    },
    [begin],
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch
    void load(false);
    return () => window.clearTimeout(timer.current);
  }, [load]);

  const card = deck[idx];

  const pick = useCallback((choice: string) => {
    if (phase !== "playing" || picked !== null || !card) return;
    setPicked(choice);
    const right = choice === card.term;
    if (right) {
      const secs = (performance.now() - roundStart.current) / 1000;
      streakRef.current += 1;
      hitsRef.current += 1;
      scoreRef.current +=
        10 +
        Math.max(0, 10 - Math.floor(secs)) +
        (streakRef.current >= STREAK_AT ? 5 : 0);
      navigator.vibrate?.(8);
    } else {
      streakRef.current = 0;
      navigator.vibrate?.([20, 40, 20]);
    }
    setScore(scoreRef.current);
    setStreak(streakRef.current);
    setHits(hitsRef.current);

    timer.current = window.setTimeout(
      () => {
        if (idx + 1 >= deck.length) {
          onGameOver(scoreRef.current);
          setPhase("over");
          return;
        }
        setIdx(idx + 1);
        setPicked(null);
        roundStart.current = performance.now();
      },
      right ? 900 : 1900,
    );
  }, [phase, picked, card, idx, deck.length, onGameOver]);

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden">
      <div className="flex items-center justify-between px-4 pt-3 text-sm">
        <span className="font-mono text-xs text-[var(--muted)]">
          {Math.min(idx + 1, Math.max(deck.length, 1))}/{deck.length || ROUNDS}
          {streak >= STREAK_AT ? ` · 🔥 ${streak}` : ""}
        </span>
        <span className="font-mono text-xs text-[var(--muted)]">
          <span className="font-bold text-[var(--accent)]">{score}</span> · best{" "}
          {best}
        </span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
        {card ? (
          <CardPic imageId={card.imageId} className="min-h-0 flex-1" />
        ) : (
          <div className="min-h-0 flex-1 rounded-2xl bg-[var(--accent)]/10" />
        )}
        <p className="truncate text-center text-[11px] text-[var(--muted)]">
          {picked && card ? `From “${card.setTitle}”` : "What's on this card?"}
        </p>
        <div className="grid grid-cols-2 gap-2">
          {(card?.choices ?? []).map((c) => {
            const isRight = c === card?.term;
            const tone =
              picked === null
                ? "glass squish-shadow"
                : isRight
                  ? "border border-emerald-400/60 bg-emerald-400/20"
                  : c === picked
                    ? "border border-rose-400/60 bg-rose-400/20"
                    : "glass opacity-50";
            return (
              <button
                key={c}
                onClick={() => pick(c)}
                disabled={picked !== null}
                data-choice
                className={`spring min-h-14 rounded-2xl px-3 py-2 text-left text-sm font-semibold leading-snug transition ${tone}`}
              >
                <span className="line-clamp-3">{c}</span>
              </button>
            );
          })}
        </div>
      </div>

      {phase === "ready" && (
        <StartOverlay
          status={status}
          onStart={begin}
          hint={`${ROUNDS} pictures from your sets. Pick the right term, fast answers and streaks score more 📸`}
        />
      )}

      {phase === "over" && (
        <OverOverlay
          score={score}
          best={best}
          detail={`${hits}/${deck.length} right`}
          onRetry={() => void load(true)}
          onExit={onExit}
        />
      )}
    </div>
  );
}
