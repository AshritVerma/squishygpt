"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RunnerGame } from "./RunnerGame";
import { CatchGame } from "./CatchGame";
import { FlappyGame } from "./FlappyGame";
import { FocusGame } from "./FocusGame";
import { ZoomiesGame } from "./ZoomiesGame";
import { MemoryGame } from "./MemoryGame";
import { Shop } from "./Shop";
import { fetchClientState, pushClientState } from "@/lib/clientState";
import {
  earnPoints,
  readWallet,
  syncWallet,
  type Wallet,
} from "@/lib/pawPoints";
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
  {
    id: "zoomies",
    title: "Zoomies",
    blurb: "Whack-a-Cleia! Tap her fast, never the grapes.",
    Component: ZoomiesGame,
  },
  {
    id: "memory",
    title: "Memory Match",
    blurb: "Flip the cards, find the pairs.",
    Component: MemoryGame,
  },
] as const satisfies readonly {
  id: string;
  title: string;
  blurb: string;
  Component: (props: GameProps) => React.ReactNode;
}[];

type GameId = (typeof GAMES)[number]["id"];
type Screen = "menu" | "shop" | GameId;

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
  const [wallet, setWallet] = useState<Wallet>(readWallet);
  const [earnedToast, setEarnedToast] = useState<number | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    syncArcadeBests().then((merged) => {
      bestsRef.current = merged;
      setBests(merged);
    });
    syncWallet().then(setWallet);
    return () => window.clearTimeout(toastTimer.current);
  }, []);

  // Tell the ambient Cleia to step aside while the arcade is open.
  useEffect(() => {
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

  const onGameOver = useCallback(
    (which: GameId, score: number) => {
      // Every run pays out paw points equal to its score.
      if (score > 0) {
        setWallet(earnPoints(score));
        setEarnedToast(score);
        window.clearTimeout(toastTimer.current);
        toastTimer.current = window.setTimeout(() => setEarnedToast(null), 2600);
      }

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
                {active
                  ? active.title
                  : screen === "shop"
                    ? "Paw Shop"
                    : "Cleia's Arcade"}
              </span>
            </h2>
          </div>
          <div className="flex items-center gap-1.5">
            {screen === "menu" && (
              <button
                onClick={() => setScreen("shop")}
                className="spring flex items-center gap-1 rounded-full bg-[var(--accent)]/10 px-2.5 py-1 text-xs font-bold text-[var(--accent)]"
              >
                {wallet.balance} 🐾
              </button>
            )}
            <button
              onClick={onClose}
              aria-label="Close arcade"
              className="spring rounded-full px-2.5 py-1 text-[var(--muted)] transition hover:bg-[var(--accent)]/10 hover:text-[var(--accent)]"
            >
              ✕
            </button>
          </div>
        </div>

        {/* points-earned toast */}
        {earnedToast !== null && (
          <div className="pointer-events-none absolute left-1/2 top-14 z-10 -translate-x-1/2">
            <div className="glass squish-shadow speech-pop rounded-full px-3 py-1 text-xs font-bold text-[var(--accent)]">
              +{earnedToast} paw points 🐾
            </div>
          </div>
        )}

        {/* Body */}
        {active ? (
          <active.Component
            best={bests[active.id]}
            onGameOver={(s) => onGameOver(active.id, s)}
            onExit={() => setScreen("menu")}
          />
        ) : screen === "shop" ? (
          <Shop wallet={wallet} onWalletChange={setWallet} />
        ) : (
          <div className="scroll-area flex flex-1 flex-col gap-3 overflow-y-auto p-4">
            <p className="text-center text-xs text-[var(--muted)]">
              Take a quick break with Cleia. 🐾
            </p>
            {GAMES.map((g) => (
              <button
                key={g.id}
                onClick={() => setScreen(g.id)}
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
            <button
              onClick={() => setScreen("shop")}
              className="accent-gradient glow-hover squish-shadow flex items-center justify-between rounded-2xl px-4 py-4 text-left text-white"
            >
              <span>
                <span className="block font-bold">Paw Shop</span>
                <span className="block text-xs text-white/80">
                  Spend your points on real-life rewards 💝
                </span>
              </span>
              <span className="shrink-0 text-xs font-bold">
                {wallet.balance} 🐾
              </span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
