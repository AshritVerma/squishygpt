"use client";

import { useState } from "react";
import { computeYearStats } from "@/lib/yearStats";

// A sealed birthday letter from Squishy & Cleia, shown on the empty chat
// screen on Aug 25. Tap to open; it reads a short letter woven from her real
// study stats, with a door into the "Serena Wrapped" recap.
export function BirthdayLetter({ onOpenRecap }: { onOpenRecap: () => void }) {
  const [open, setOpen] = useState(false);
  // Stats are computed lazily on first open (localStorage is ready by then).
  const [stats] = useState(computeYearStats);

  const studied =
    stats.questions > 0
      ? `You asked me ${stats.questions} question${stats.questions === 1 ? "" : "s"} this year — every single one made you a little more Dr. Serena. `
      : "";
  const topic =
    stats.topTopics.length > 0
      ? `Lately your brain keeps circling back to ${stats.topTopics[0]} — future patients are lucky you're this thorough. `
      : "";

  return (
    <>
      <button
        data-testid="birthday-letter"
        onClick={() => setOpen(true)}
        className="glass glow-hover squish-shadow bubble-in mt-5 flex w-full max-w-sm items-center gap-3 rounded-2xl border border-[var(--accent)]/40 px-4 py-3 text-left"
      >
        <span className="text-2xl">💌</span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold">
            A letter from Squishy &amp; Cleia
          </span>
          <span className="block text-xs text-[var(--muted)]">
            sealed until today. tap to open 🎂
          </span>
        </span>
      </button>

      {open && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <div
            data-testid="birthday-letter-open"
            className="glass squish-shadow bubble-in scroll-area relative max-h-[85dvh] w-full max-w-sm overflow-y-auto rounded-3xl p-6"
          >
            <button
              onClick={() => setOpen(false)}
              aria-label="Close letter"
              className="spring absolute right-3 top-3 rounded-full px-2.5 py-1 text-[var(--muted)] hover:text-[var(--accent)]"
            >
              ✕
            </button>
            <p className="text-3xl">🎂</p>
            <h3 className="mt-2 text-xl font-extrabold tracking-tight">
              Happy birthday, <span className="accent-text">Dr. Serena</span>!!
            </h3>
            <div className="mt-3 space-y-3 text-[15px] leading-relaxed">
              <p>
                It&apos;s us — your squishy brain and your dog. We&apos;ve been
                saving this all year.
              </p>
              <p>
                {studied}
                {topic}
                We watched you show up tired after clinic and still ask one
                more question, and we want it on the record: you are going to
                be an incredible optometrist.
              </p>
              <p>
                Today there are no flashcards you have to touch. There&apos;s
                cake in the arcade, presents in the Paw Shop, and Cleia has
                been practicing her party trick since June (it&apos;s sitting,
                but with a hat on).
              </p>
              <p className="font-semibold">
                We love you the most. — Squishy 🧠 &amp; Cleia 🐾 (and Ashrit,
                who typed this because we don&apos;t have thumbs)
              </p>
            </div>
            <button
              onClick={() => {
                setOpen(false);
                onOpenRecap();
              }}
              className="accent-gradient spring mt-5 w-full rounded-2xl py-3 font-semibold text-white"
            >
              See your year in review 🎁
            </button>
          </div>
        </div>
      )}
    </>
  );
}
