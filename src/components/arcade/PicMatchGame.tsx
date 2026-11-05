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

interface Tile {
  key: string;
  pair: number;
  kind: "pic" | "term";
  card: ImageCard;
  state: "down" | "up" | "matched";
}

const PAIRS = 6; // 3x4 grid

function deal(cards: ImageCard[]): Tile[] {
  const tiles = cards.flatMap((card, pair) => [
    { key: `p${pair}`, pair, kind: "pic" as const, card, state: "down" as const },
    { key: `t${pair}`, pair, kind: "term" as const, card, state: "down" as const },
  ]);
  for (let i = tiles.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
  }
  return tiles;
}

// Pic Match — memory, but each pair is one of Serena's card images and its
// term. Same scoring as Memory Match: 10 a pair, minus a point per extra
// flip, plus up to 40 for speed.
export function PicMatchGame({ best, onGameOver, onExit }: GameProps) {
  const [status, setStatus] = useState<Status>("loading");
  const [phase, setPhase] = useState<Phase>("ready");
  const [tiles, setTiles] = useState<Tile[]>([]);
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

  useEffect(() => {
    if (phase !== "playing") return;
    const iv = window.setInterval(() => {
      secondsRef.current += 1;
      setSeconds(secondsRef.current);
    }, 1000);
    return () => window.clearInterval(iv);
  }, [phase]);

  const begin = useCallback(() => {
    setMoves(0);
    setSeconds(0);
    movesRef.current = 0;
    secondsRef.current = 0;
    upRef.current = null;
    lockRef.current = false;
    phaseRef.current = "playing";
    setPhase("playing");
  }, []);

  const load = useCallback(
    async (autostart: boolean) => {
      window.clearTimeout(flipTimer.current);
      setStatus("loading");
      setPhase("ready");
      try {
        const cards = await fetchImageCards(PAIRS);
        if (cards.length < 2) return setStatus("empty");
        await preloadImages(cards);
        setTiles(deal(cards));
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
    return () => window.clearTimeout(flipTimer.current);
  }, [load]);

  const finish = useCallback(
    (pairs: number) => {
      const extra = Math.max(0, movesRef.current - pairs);
      const timeBonus = Math.max(0, 40 - Math.floor(secondsRef.current / 3));
      const score = Math.max(pairs, pairs * 10 - extra + timeBonus);
      setFinalScore(score);
      onGameOver(score);
      setPhase("over");
    },
    [onGameOver],
  );

  const flip = (idx: number) => {
    if (phaseRef.current !== "playing" || lockRef.current) return;
    const tile = tiles[idx];
    const firstIdx = upRef.current;
    if (!tile || tile.state !== "down" || firstIdx === idx) return;
    const setState = (which: number[], state: Tile["state"]) =>
      tiles.map((t, i) => (which.includes(i) ? { ...t, state } : t));

    if (firstIdx === null) {
      upRef.current = idx;
      setTiles(setState([idx], "up"));
      return;
    }

    upRef.current = null;
    movesRef.current += 1;
    setMoves(movesRef.current);

    if (tiles[firstIdx].pair === tile.pair) {
      navigator.vibrate?.(8);
      const matched = setState([idx, firstIdx], "matched");
      setTiles(matched);
      if (matched.every((t) => t.state === "matched")) {
        window.setTimeout(() => finish(matched.length / 2), 450);
      }
      return;
    }

    lockRef.current = true;
    setTiles(setState([idx], "up"));
    window.clearTimeout(flipTimer.current);
    flipTimer.current = window.setTimeout(() => {
      setTiles((cur) =>
        cur.map((t, i) =>
          i === idx || i === firstIdx ? { ...t, state: "down" as const } : t,
        ),
      );
      lockRef.current = false;
    }, 1100);
  };

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden">
      <div className="flex items-center justify-between px-4 pt-3 text-sm">
        <span className="font-mono text-xs text-[var(--muted)]">
          {moves} moves · {seconds}s
        </span>
        <span className="font-mono text-[11px] text-[var(--muted)]">
          best {best}
        </span>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-3 grid-rows-4 gap-2 p-4">
        {tiles.map((t, i) => (
          <button
            key={t.key}
            onClick={() => flip(i)}
            disabled={t.state !== "down" && phase === "playing"}
            data-pair={t.pair}
            aria-label={
              t.state === "down"
                ? "Face-down card"
                : t.kind === "term"
                  ? t.card.term
                  : "Card image"
            }
            className={`memory-card min-h-0 overflow-hidden rounded-2xl ${
              t.state === "down"
                ? "accent-gradient"
                : t.state === "matched"
                  ? "border border-emerald-400/50 bg-emerald-400/10"
                  : "glass squish-shadow"
            } ${t.state !== "down" ? "memory-flip" : ""}`}
          >
            {t.state === "down" ? (
              <span className="text-lg text-white/70">🐾</span>
            ) : t.kind === "pic" ? (
              <CardPic
                imageId={t.card.imageId}
                className={`h-full w-full ${t.state === "matched" ? "opacity-70" : ""}`}
              />
            ) : (
              <span
                className={`line-clamp-4 px-1.5 text-[11px] font-semibold leading-tight ${
                  t.state === "matched" ? "opacity-70" : ""
                }`}
              >
                {t.card.term}
              </span>
            )}
          </button>
        ))}
      </div>

      {phase === "ready" && (
        <StartOverlay
          status={status}
          onStart={begin}
          hint="Match each picture from your cards to its term. Fewer flips and faster times score more 🧠"
        />
      )}

      {phase === "over" && (
        <OverOverlay
          score={finalScore}
          best={best}
          detail={`${moves} moves · ${seconds}s`}
          onRetry={() => void load(true)}
          onExit={onExit}
        />
      )}
    </div>
  );
}
