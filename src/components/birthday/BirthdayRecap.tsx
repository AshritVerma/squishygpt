"use client";

import { useEffect, useState } from "react";
import { SquishyMascot } from "@/components/SquishyMascot";
import { fetchWallet } from "@/lib/pawPoints";
import { serenaAge } from "@/lib/birthday";
import { computeYearStats, type YearStats } from "@/lib/yearStats";

// The "Serena Wrapped" birthday recap — a Spotify-Wrapped-style card of her
// year in the app, built from on-device history. Made for screenshotting.
export function BirthdayRecap({ onClose }: { onClose: () => void }) {
  const [stats, setStats] = useState<YearStats | null>(null);
  const [lifetime, setLifetime] = useState<number | null>(null);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setStats(computeYearStats()));
    fetchWallet().then((w) => setLifetime(w.lifetime));
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const year = new Date().getFullYear();

  const rows: { label: string; value: string; emoji: string }[] = stats
    ? [
        {
          emoji: "❓",
          label: "Questions asked",
          value: String(stats.questions),
        },
        {
          emoji: "💬",
          label: "Study conversations",
          value: String(stats.conversations),
        },
        ...(stats.busiestDay
          ? [
              {
                emoji: "📅",
                label: "Busiest study day",
                value: stats.busiestDay,
              },
            ]
          : []),
        ...(stats.topTopics.length > 0
          ? [
              {
                emoji: "🧠",
                label: "On your mind most",
                value: stats.topTopics.join(" · "),
              },
            ]
          : []),
        ...(stats.bestGame
          ? [
              {
                emoji: "🕹️",
                label: `Arcade record · ${stats.bestGame.title}`,
                value: String(stats.bestGame.score),
              },
            ]
          : []),
        ...(lifetime !== null && lifetime > 0
          ? [
              {
                emoji: "🐾",
                label: "Paw points earned all-time",
                value: String(lifetime),
              },
            ]
          : []),
      ]
    : [];

  return (
    <div
      data-testid="birthday-recap"
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
    >
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="bubble-in relative w-full max-w-sm overflow-hidden rounded-3xl bg-gradient-to-b from-pink-500 via-fuchsia-500 to-purple-600 p-[2px]">
        <div className="scroll-area max-h-[85dvh] overflow-y-auto rounded-[calc(1.5rem-2px)] bg-gradient-to-b from-[#2a1035] to-[#160a1f] px-6 py-7 text-white">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-pink-300">
              SquishyGPT presents
            </p>
            <button
              onClick={onClose}
              aria-label="Close recap"
              className="spring rounded-full px-2 py-0.5 text-white/60 hover:text-white"
            >
              ✕
            </button>
          </div>
          <h2 className="mt-1 text-3xl font-extrabold leading-tight">
            Serena{" "}
            <span className="bg-gradient-to-r from-pink-300 to-amber-200 bg-clip-text text-transparent">
              Wrapped
            </span>
          </h2>
          <p className="text-sm font-semibold text-pink-200">
            your year as a future optometrist · turning {serenaAge()} · {year}{" "}
            🎂
          </p>

          <div className="pointer-events-none mx-auto -mb-2 mt-2 flex justify-center">
            <SquishyMascot size={110} interactive={false} />
          </div>

          <div className="mt-3 flex flex-col gap-2.5">
            {rows.map((r) => (
              <div
                key={r.label}
                className="flex items-center gap-3 rounded-2xl bg-white/[0.07] px-4 py-3"
              >
                <span className="text-xl">{r.emoji}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-white/50">
                    {r.label}
                  </p>
                  <p className="truncate text-lg font-extrabold">{r.value}</p>
                </div>
              </div>
            ))}
            {rows.length === 0 && (
              <p className="py-6 text-center text-sm text-white/60">
                counting everything up…
              </p>
            )}
          </div>

          <p className="mt-5 text-center text-xs leading-relaxed text-white/60">
            every one of these was you getting better at this.
            <br />
            proud of you, doctor. — made with 💗 by ashrit (and cleia 🐾)
          </p>
        </div>
      </div>
    </div>
  );
}
