"use client";

import { useState } from "react";

export interface ImageCard {
  imageId: number;
  term: string;
  setTitle: string;
  choices: string[];
}

export const imageSrc = (id: number) => `/api/card-images/${id}`;

/** Random image cards (with multiple-choice options) from Serena's sets. */
export async function fetchImageCards(count: number): Promise<ImageCard[]> {
  const res = await fetch(`/api/arcade/image-cards?count=${count}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`image cards: ${res.status}`);
  const data = (await res.json()) as { cards?: ImageCard[] };
  return data.cards ?? [];
}

/** Warm the browser cache; resolves once every image has loaded or failed. */
export function preloadImages(cards: ImageCard[]): Promise<void> {
  return Promise.all(
    cards.map(
      (c) =>
        new Promise<void>((resolve) => {
          const img = new Image();
          img.onload = img.onerror = () => resolve();
          img.src = imageSrc(c.imageId);
        }),
    ),
  ).then(() => undefined);
}

/** A card image on a white mat (diagrams are often transparent PNGs). */
export function CardPic({
  imageId,
  className = "",
}: {
  imageId: number;
  className?: string;
}) {
  const [loaded, setLoaded] = useState(false);
  return (
    <div
      className={`relative overflow-hidden rounded-2xl bg-white ${className}`}
    >
      {!loaded && (
        <div className="absolute inset-0 animate-pulse bg-[var(--accent)]/10" />
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        key={imageId}
        src={imageSrc(imageId)}
        alt="Flashcard image"
        draggable={false}
        onLoad={() => setLoaded(true)}
        onError={() => setLoaded(true)}
        className="h-full w-full select-none object-contain"
      />
    </div>
  );
}

export function StartOverlay({
  hint,
  status,
  onStart,
}: {
  hint: string;
  status: "loading" | "ready" | "empty" | "error";
  onStart: () => void;
}) {
  return (
    <div
      className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-1 bg-black/10 px-6 text-center backdrop-blur-[2px]"
      onPointerDown={status === "ready" ? onStart : undefined}
    >
      {status === "loading" && (
        <p className="text-sm font-semibold text-[var(--muted)]">
          Shuffling your cards…
        </p>
      )}
      {status === "ready" && (
        <>
          <p className="text-base font-bold">Tap to start</p>
          <p className="max-w-[260px] text-xs text-[var(--muted)]">{hint}</p>
        </>
      )}
      {status === "empty" && (
        <p className="max-w-[260px] text-sm text-[var(--muted)]">
          No card images yet. Once your sets&apos; pictures are imported,
          they&apos;ll show up here.
        </p>
      )}
      {status === "error" && (
        <p className="max-w-[260px] text-sm text-[var(--muted)]">
          Couldn&apos;t load your cards. Check your connection and reopen the
          game.
        </p>
      )}
    </div>
  );
}

export function OverOverlay({
  score,
  best,
  detail,
  onRetry,
  onExit,
}: {
  score: number;
  best: number;
  detail: string;
  onRetry: () => void;
  onExit: () => void;
}) {
  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-black/20 text-center backdrop-blur-[2px]">
      <div className="glass squish-shadow rounded-2xl px-6 py-5">
        <p className="text-sm text-[var(--muted)]">Score</p>
        <p className="text-3xl font-extrabold">
          <span className="accent-text">{score}</span>
        </p>
        <p className="mt-1 text-xs text-[var(--muted)]">
          {detail} · Best {Math.max(best, score)}
          {score >= best && score > 0 ? " · new best! 🎉" : ""}
        </p>
        <div className="mt-4 flex gap-2">
          <button
            onClick={onRetry}
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
  );
}
