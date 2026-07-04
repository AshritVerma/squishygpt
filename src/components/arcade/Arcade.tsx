"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RunnerGame } from "./RunnerGame";
import { CatchGame } from "./CatchGame";
import { FlappyGame } from "./FlappyGame";
import { FocusGame } from "./FocusGame";
import { fetchClientState, pushClientState } from "@/lib/clientState";
import { track } from "@/lib/analyticsClient";
import type { GameProps } from "./types";

const GAMES = [
  {
    id: "runner",
    title: "Cleia Runner",
    blurb: "Hop over the eye charts. Tap to jump.",
    Component: RunnerGame,
  },
  {
    id: "catch",
    title: "Treat Catch",
    blurb: "Slide Cleia to catch treats, dodge grapes.",
    Component: CatchGame,
  },
  {
    id: "flappy",
    title: "Cleia Flappy",
    blurb: "Flap through the phoropter towers. Tap to fly.",
    Component: FlappyGame,
  },
  {
    id: "focus",
    title: "Focus Ring",
    blurb: "Tap the instant the chart snaps sharp.",
    Component: FocusGame,
  },
] as const satisfies readonly {
  id: string;
  title: string;
  blurb: string;
  Component: (props: GameProps) => React.ReactNode;
}[];

type GameId = (typeof GAMES)[number]["id"];
type Screen = "menu" | GameId;

const ARCADE_STATE_KEY = "arcade";

type ArcadeBests = Record<GameId, number>;

const GAME_IDS = GAMES.map((g) => g.id) as GameId[];

const bestKey = (g: GameId) => `squishygpt.arcade.${g}`;

function readBest(g: GameId): number {
  try {
    return parseInt(localStorage.getItem(bestKey(g)) || "0", 10) || 0;
  } catch {
    return 0;
  }
}
function writeBest(g: GameId, score: number) {
  try {
    localStorage.setItem(bestKey(g), String(score));
  } catch {
    /* best-effort */
  }
}

function readLocalBests(): ArcadeBests {
  return Object.fromEntries(
    GAME_IDS.map((g) => [g, readBest(g)]),
  ) as ArcadeBests;
}

// Merge local and server high scores (max wins), write back to both sides.
// Also called from Chat on page load so scores sync without opening the arcade.
export async function syncArcadeBests(): Promise<ArcadeBests> {
  const local = readLocalBests();
  const remote = await fetchClientState<Partial<ArcadeBests>>(ARCADE_STATE_KEY);
  const merged = Object.fromEntries(
    GAME_IDS.map((g) => [g, Math.max(local[g], remote?.[g] || 0)]),
  ) as ArcadeBests;
  for (const g of GAME_IDS) writeBest(g, merged[g]);
  const serverBehind =
    !remote || GAME_IDS.some((g) => merged[g] > (remote[g] || 0));
  if (serverBehind && GAME_IDS.some((g) => merged[g] > 0)) {
    pushClientState(ARCADE_STATE_KEY, merged);
  }
  return merged;
}

// Cleia's Arcade — a full-screen overlay with canvas mini games. Hides the
// ambient Cleia while open (via the squishy:arcade event) so there's only one.
export function Arcade({ onClose }: { onClose: () => void }) {
  const [screen, setScreen] = useState<Screen>("menu");
  // Local bests show instantly; the server copy is merged in below (max wins)
  // so bests carry across devices/domains.
  const [bests, setBests] = useState<ArcadeBests>(readLocalBests);
  const bestsRef = useRef<ArcadeBests>(bests);

  useEffect(() => {
    syncArcadeBests().then((merged) => {
      bestsRef.current = merged;
      setBests(merged);
    });
  }, []);

  // Tell the ambient Cleia to step aside while the arcade is open.
  useEffect(() => {
    track("arcade_opened");
    window.dispatchEvent(
      new CustomEvent("squishy:arcade", { detail: { open: true } }),
    );
    return () => {
      window.dispatchEvent(
        new CustomEvent("squishy:arcade", { detail: { open: false } }),
      );
    };
  }, []);

  // Escape backs out to the menu, then closes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (screen !== "menu") setScreen("menu");
      else onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [screen, onClose]);

  const reduce =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const startGame = useCallback((id: GameId) => {
    track("arcade_game_started", { game: id });
    setScreen(id);
  }, []);

  const onGameOver = useCallback(
    (which: GameId, score: number) => {
      track("arcade_game_over", { game: which, score });
      if (score <= bestsRef.current[which]) return;
      const next = { ...bestsRef.current, [which]: score };
      bestsRef.current = next;
      setBests(next);
      writeBest(which, score);
      pushClientState(ARCADE_STATE_KEY, next);
      if (!reduce) window.dispatchEvent(new Event("squishy:confetti"));
    },
    [reduce],
  );

  const active = GAMES.find((g) => g.id === screen);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div className="glass squish-shadow bubble-in relative flex h-[min(88dvh,720px)] w-full max-w-md flex-col overflow-hidden rounded-3xl">
        {/* Header */}
        <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] px-4 py-3">
          <div className="flex items-center gap-2">
            {screen !== "menu" && (
              <button
                onClick={() => setScreen("menu")}
                aria-label="Back to arcade menu"
                className="spring rounded-full px-2 py-1 text-[var(--muted)] transition hover:bg-[var(--accent)]/10 hover:text-[var(--accent)]"
              >
                ‹
              </button>
            )}
            <h2 className="text-sm font-extrabold tracking-tight">
              <span className="accent-text">
                {active ? active.title : "Cleia's Arcade"}
              </span>
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close arcade"
            className="spring rounded-full px-2.5 py-1 text-[var(--muted)] transition hover:bg-[var(--accent)]/10 hover:text-[var(--accent)]"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        {!active ? (
          <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
            <p className="text-center text-xs text-[var(--muted)]">
              Take a quick break with Cleia. 🐾
            </p>
            {GAMES.map((g) => (
              <button
                key={g.id}
                onClick={() => startGame(g.id)}
                className="glass glow-hover squish-shadow flex items-center justify-between rounded-2xl px-4 py-4 text-left"
              >
                <span>
                  <span className="block font-bold">{g.title}</span>
                  <span className="block text-xs text-[var(--muted)]">
                    {g.blurb}
                  </span>
                </span>
                <span className="shrink-0 text-xs font-semibold text-[var(--accent)]">
                  Best {bests[g.id]}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <active.Component
            best={bests[active.id]}
            onGameOver={(s) => onGameOver(active.id, s)}
            onExit={() => setScreen("menu")}
          />
        )}
      </div>
    </div>
  );
}
