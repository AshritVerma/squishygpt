"use client";

import { useEffect } from "react";

export interface LightboxImage {
  src: string;
  caption: string;
  term?: string;
  setTitle?: string;
}

/**
 * Fullscreen image viewer. Closes on tap-outside or Escape, like SetModal.
 * The image is object-contain and pinch-zoom is allowed for close inspection
 * of a clinical photo on a phone.
 */
export function ImageLightbox({
  image,
  onClose,
}: {
  image: LightboxImage;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
      <div
        className="bubble-in relative flex max-h-[92dvh] w-full max-w-3xl flex-col items-center gap-3"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          aria-label="Close"
          className="spring absolute -top-1 right-0 z-10 rounded-full bg-black/40 px-2.5 py-1 text-white/90 transition hover:bg-black/60"
        >
          ✕
        </button>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={image.src}
          alt={image.caption || image.term || "Card image"}
          className="max-h-[75dvh] w-auto max-w-full touch-pinch-zoom rounded-2xl object-contain"
        />
        {(image.caption || image.term || image.setTitle) && (
          <div className="glass squish-shadow max-w-full rounded-2xl px-4 py-3 text-center">
            {image.term && (
              <p className="text-sm font-semibold text-[var(--foreground)]">
                {image.term}
              </p>
            )}
            {image.caption && (
              <p className="mt-0.5 text-xs leading-relaxed text-[var(--muted)]">
                {image.caption}
              </p>
            )}
            {image.setTitle && (
              <p className="mt-1 text-[11px] uppercase tracking-wide text-[var(--muted)]">
                {image.setTitle}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
