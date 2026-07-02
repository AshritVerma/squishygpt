"use client";

import { useEffect, useState } from "react";

interface SetCard {
  id: number;
  term: string;
  definition: string;
}

interface SetDetail {
  id: number;
  title: string;
  source_url: string | null;
  created_at: string;
  cards: SetCard[];
}

export function SetModal({
  setId,
  onClose,
}: {
  setId: number;
  onClose: () => void;
}) {
  const [set, setSet] = useState<SetDetail | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/sets/${setId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data) => {
        if (!cancelled) setSet(data.set);
      })
      .catch(() => !cancelled && setError("Couldn't load this set."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [setId]);

  // Close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const cards = set?.cards ?? [];
  const filtered = q
    ? cards.filter(
        (c) =>
          c.term.toLowerCase().includes(q.toLowerCase()) ||
          c.definition.toLowerCase().includes(q.toLowerCase()),
      )
    : cards;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div
        onClick={onClose}
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
      />
      <div className="glass squish-shadow bubble-in relative flex max-h-[85dvh] w-full max-w-lg flex-col rounded-t-3xl sm:rounded-3xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
              Study set
            </p>
            <h2 className="truncate text-lg font-extrabold">
              {set ? set.title : loading ? "Loading…" : "Set"}
            </h2>
            {set && (
              <p className="mt-0.5 text-xs text-[var(--muted)]">
                {set.cards.length} card{set.cards.length === 1 ? "" : "s"}
                {set.source_url && (
                  <>
                    {" · "}
                    <a
                      href={set.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[var(--accent)] underline"
                    >
                      open on Quizlet
                    </a>
                  </>
                )}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="spring shrink-0 rounded-full px-2.5 py-1 text-[var(--muted)] transition hover:bg-[var(--accent)]/10 hover:text-[var(--accent)]"
          >
            ✕
          </button>
        </div>

        {/* Search */}
        {set && set.cards.length > 6 && (
          <div className="px-5 pt-3">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Filter cards…"
              className="glass w-full rounded-2xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--ring)]"
            />
          </div>
        )}

        {/* Body */}
        <div className="scroll-area flex-1 overflow-y-auto px-5 py-4">
          {loading && (
            <p className="py-8 text-center text-sm text-[var(--muted)]">
              Loading cards…
            </p>
          )}
          {error && (
            <p className="py-8 text-center text-sm text-rose-500">{error}</p>
          )}
          {!loading && !error && filtered.length === 0 && (
            <p className="py-8 text-center text-sm text-[var(--muted)]">
              No matching cards.
            </p>
          )}
          <div className="flex flex-col gap-2">
            {filtered.map((c) => (
              <div
                key={c.id}
                className="rounded-2xl border border-[var(--border)] bg-[var(--accent)]/[0.04] px-4 py-3"
              >
                <p className="font-semibold text-[var(--foreground)]">
                  {c.term}
                </p>
                <p className="mt-1 text-sm leading-relaxed text-[var(--muted)]">
                  {c.definition}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
