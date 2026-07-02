"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RunnerGame } from "./RunnerGame";
import { CatchGame } from "./CatchGame";
import { fetchClientState, pushClientState } from "@/lib/clientState";

type Game = "menu" | "runner" | "catch";

const ARCADE_STATE_KEY = "arcade";

interface ArcadeBests {
  runner: number;
  catch: number;
}

const bestKey = (g: "runner" | "catch") => `squishygpt.arcade.${g}`;

function readBest(g: "runner" | "catch"): number {
  try {
    return parseInt(localStorage.getItem(bestKey(g)) || "0", 10) || 0;
  } catch {
    return 0;
  }
}
function writeBest(g: "runner" | "catch", score: number) {
  try {
    localStorage.setItem(bestKey(g), String(score));
  } catch {
    /* best-effort */
  }
}

// Merge local and server high scores (max wins), write back to both sides.
// Also called from Chat on page load so scores sync without opening the arcade.
export async function syncArcadeBests(): Promise<ArcadeBests> {
  const local: ArcadeBests = {
    runner: readBest("runner"),
    catch: readBest("catch"),
  };
  const remote = await fetchClientState<ArcadeBests>(ARCADE_STATE_KEY);
  const merged: ArcadeBests = {
    runner: Math.max(local.runner, remote?.runner || 0),
    catch: Math.max(local.catch, remote?.catch || 0),
  };
  writeBest("runner", merged.runner);
  writeBest("catch", merged.catch);
  const serverBehind =
    !remote ||
    merged.runner > (remote.runner || 0) ||
    merged.catch > (remote.catch || 0);
  if (serverBehind && (merged.runner > 0 || merged.catch > 0)) {
    pushClientState(ARCADE_STATE_KEY, merged);
  }
  return merged;
}

// Cleia's Arcade — a full-screen overlay with two canvas mini games. Hides the
// ambient Cleia while open (via the squishy:arcade event) so there's only one.
export function Arcade({ onClose }: { onClose: () => void }) {
  const [game, setGame] = useState<Game>("menu");
  const [bestRunner, setBestRunner] = useState(0);
  const [bestCatch, setBestCatch] = useState(0);
  const bestsRef = useRef<ArcadeBests>({ runner: 0, catch: 0 });

  // High scores: show local instantly, then merge the server copy (max wins)
  // so bests carry across devices/domains.
  useEffect(() => {
    const local: ArcadeBests = {
      runner: readBest("runner"),
      catch: readBest("catch"),
    };
    bestsRef.current = local;
    setBestRunner(local.runner);
    setBestCatch(local.catch);
    syncArcadeBests().then((merged) => {
      bestsRef.current = merged;
      setBestRunner(merged.runner);
      setBestCatch(merged.catch);
    });
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
      if (game !== "menu") setGame("menu");
      else onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [game, onClose]);

  const reduce =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const onGameOver = useCallback(
    (which: "runner" | "catch", score: number) => {
      const cur = which === "runner" ? bestRunner : bestCatch;
      if (score > cur) {
        if (which === "runner") setBestRunner(score);
        else setBestCatch(score);
        writeBest(which, score);
        bestsRef.current = { ...bestsRef.current, [which]: score };
        pushClientState(ARCADE_STATE_KEY, bestsRef.current);
        if (!reduce) window.dispatchEvent(new Event("squishy:confetti"));
      }
    },
    [bestRunner, bestCatch, reduce],
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div className="glass squish-shadow bubble-in relative flex h-[min(88dvh,720px)] w-full max-w-md flex-col overflow-hidden rounded-3xl">
        {/* Header */}
        <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] px-4 py-3">
          <div className="flex items-center gap-2">
            {game !== "menu" && (
              <button
                onClick={() => setGame("menu")}
                aria-label="Back to arcade menu"
                className="spring rounded-full px-2 py-1 text-[var(--muted)] transition hover:bg-[var(--accent)]/10 hover:text-[var(--accent)]"
              >
                ‹
              </button>
            )}
            <h2 className="text-sm font-extrabold tracking-tight">
              <span className="accent-text">
                {game === "runner"
                  ? "Cleia Runner"
                  : game === "catch"
                    ? "Treat Catch"
                    : "Cleia's Arcade"}
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
        {game === "menu" ? (
          <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
            <p className="text-center text-xs text-[var(--muted)]">
              Take a quick break with Cleia. 🐾
            </p>
            <button
              onClick={() => setGame("runner")}
              className="glass glow-hover squish-shadow flex items-center justify-between rounded-2xl px-4 py-4 text-left"
            >
              <span>
                <span className="block font-bold">Cleia Runner</span>
                <span className="block text-xs text-[var(--muted)]">
                  Hop over the eye charts. Tap to jump.
                </span>
              </span>
              <span className="shrink-0 text-xs font-semibold text-[var(--accent)]">
                Best {bestRunner}
              </span>
            </button>
            <button
              onClick={() => setGame("catch")}
              className="glass glow-hover squish-shadow flex items-center justify-between rounded-2xl px-4 py-4 text-left"
            >
              <span>
                <span className="block font-bold">Treat Catch</span>
                <span className="block text-xs text-[var(--muted)]">
                  Slide Cleia to catch treats, dodge grapes.
                </span>
              </span>
              <span className="shrink-0 text-xs font-semibold text-[var(--accent)]">
                Best {bestCatch}
              </span>
            </button>
          </div>
        ) : game === "runner" ? (
          <RunnerGame
            best={bestRunner}
            onGameOver={(s) => onGameOver("runner", s)}
            onExit={() => setGame("menu")}
          />
        ) : (
          <CatchGame
            best={bestCatch}
            onGameOver={(s) => onGameOver("catch", s)}
            onExit={() => setGame("menu")}
          />
        )}
      </div>
    </div>
  );
}
