"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { track } from "@/lib/analyticsClient";

interface SetSummary {
  id: number;
  title: string;
  source_url: string | null;
  card_count: number;
  created_at: string;
}

interface SetCard {
  id: number;
  term: string;
  definition: string;
}

interface SetDetail {
  loading: boolean;
  error: string;
  cards: SetCard[];
}

export default function AdminPage() {
  const router = useRouter();
  const [sets, setSets] = useState<SetSummary[]>([]);
  const [title, setTitle] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [text, setText] = useState("");
  const [status, setStatus] = useState<{ type: "ok" | "err"; msg: string } | null>(
    null,
  );
  const [saving, setSaving] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);
  const [details, setDetails] = useState<Record<number, SetDetail>>({});

  async function load() {
    const res = await fetch("/api/sets");
    if (res.status === 401) {
      router.push("/login");
      return;
    }
    const data = await res.json();
    setSets(data.sets || []);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function addSet(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setStatus(null);
    try {
      const res = await fetch("/api/sets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, text, sourceUrl }),
      });
      const data = await res.json();
      if (res.ok) {
        setStatus({
          type: "ok",
          msg: `Added "${data.title}" with ${data.cardCount} cards.`,
        });
        setTitle("");
        setSourceUrl("");
        setText("");
        load();
      } else {
        setStatus({ type: "err", msg: data.error || "Failed to add set." });
      }
    } catch {
      setStatus({ type: "err", msg: "Something went wrong." });
    } finally {
      setSaving(false);
    }
  }

  async function loadCards(id: number) {
    setDetails((d) => ({
      ...d,
      [id]: { loading: true, error: "", cards: d[id]?.cards ?? [] },
    }));
    try {
      const res = await fetch(`/api/sets/${id}`);
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      if (!res.ok) throw new Error();
      const data = await res.json();
      setDetails((d) => ({
        ...d,
        [id]: { loading: false, error: "", cards: data.set?.cards ?? [] },
      }));
    } catch {
      setDetails((d) => ({
        ...d,
        [id]: { loading: false, error: "Couldn't load cards.", cards: [] },
      }));
    }
  }

  function toggle(id: number) {
    if (openId === id) {
      setOpenId(null);
      return;
    }
    track("study_set_viewed", { set_id: id });
    setOpenId(id);
    if (!details[id] || (details[id].cards.length === 0 && !details[id].error)) {
      loadCards(id);
    }
  }

  async function remove(id: number) {
    if (!confirm("Delete this set and its cards?")) return;
    await fetch(`/api/sets?id=${id}`, { method: "DELETE" });
    if (openId === id) setOpenId(null);
    setDetails((d) => {
      const next = { ...d };
      delete next[id];
      return next;
    });
    load();
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6">
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-xl font-extrabold tracking-tight">
          <span className="accent-text">Study sets</span>
        </h1>
        <a
          href="/"
          className="rounded-full px-3 py-1.5 text-xs font-medium text-[var(--muted)] transition hover:bg-[var(--accent)]/10 hover:text-[var(--accent)]"
        >
          ← Back to chat
        </a>
      </div>

      {/* Add set */}
      <form onSubmit={addSet} className="glass squish-shadow rounded-3xl p-5">
        <h2 className="mb-1 font-semibold">Add a set</h2>
        <p className="mb-4 text-xs text-[var(--muted)]">
          In Quizlet: open a set → ⋯ → Export → copy the text, then paste below.
          Default Quizlet export puts a Tab between term and definition, and a
          new line between cards.
        </p>

        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Set title (e.g. Ocular Disease)"
          className="glass mb-3 w-full rounded-2xl px-4 py-2.5 text-[15px] outline-none focus:ring-2 focus:ring-[var(--ring)]"
        />
        <input
          value={sourceUrl}
          onChange={(e) => setSourceUrl(e.target.value)}
          placeholder="Quizlet URL (optional)"
          className="glass mb-3 w-full rounded-2xl px-4 py-2.5 text-[15px] outline-none focus:ring-2 focus:ring-[var(--ring)]"
        />
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={8}
          placeholder={"Paste term/definition pairs here…\n\nTerm 1\\tDefinition 1\nTerm 2\\tDefinition 2"}
          className="glass mb-3 w-full resize-y rounded-2xl px-4 py-3 font-mono text-[13px] outline-none focus:ring-2 focus:ring-[var(--ring)]"
        />

        {status && (
          <p
            className={`mb-3 text-sm ${
              status.type === "ok" ? "text-emerald-500" : "text-rose-500"
            }`}
          >
            {status.msg}
          </p>
        )}

        <button
          type="submit"
          disabled={saving || !title.trim() || !text.trim()}
          className="accent-gradient w-full rounded-2xl py-3 font-semibold text-white transition active:scale-95 disabled:opacity-50"
        >
          {saving ? "Embedding cards…" : "Add to brain"}
        </button>
      </form>

      {/* Existing sets */}
      <h2 className="mb-2 mt-7 font-semibold">
        Your sets{" "}
        <span className="text-sm font-normal text-[var(--muted)]">
          ({sets.length})
        </span>
      </h2>
      <div className="flex flex-col gap-2">
        {sets.length === 0 && (
          <p className="text-sm text-[var(--muted)]">No sets yet. Add one above.</p>
        )}
        {sets.map((s) => {
          const open = openId === s.id;
          const detail = details[s.id];
          return (
            <div key={s.id} className="glass squish-shadow rounded-2xl">
              <div className="flex items-center justify-between gap-2 px-4 py-3">
                <button
                  onClick={() => toggle(s.id)}
                  aria-expanded={open}
                  className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className={`shrink-0 text-[var(--muted)] transition-transform duration-200 ${
                      open ? "rotate-90" : ""
                    }`}
                  >
                    <polyline points="9 6 15 12 9 18" />
                  </svg>
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{s.title}</span>
                    <span className="block text-xs text-[var(--muted)]">
                      {s.card_count} cards
                    </span>
                  </span>
                </button>
                <button
                  onClick={() => remove(s.id)}
                  className="shrink-0 rounded-full px-3 py-1.5 text-xs font-medium text-rose-500 transition hover:bg-rose-500/10"
                >
                  Delete
                </button>
              </div>

              {open && (
                <div className="border-t border-[var(--border)] px-4 py-3">
                  {detail?.loading && (
                    <p className="py-4 text-center text-sm text-[var(--muted)]">
                      Loading cards…
                    </p>
                  )}
                  {detail?.error && (
                    <p className="py-4 text-center text-sm text-rose-500">
                      {detail.error}
                    </p>
                  )}
                  {detail && !detail.loading && !detail.error && (
                    <>
                      {s.source_url && (
                        <a
                          href={s.source_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mb-3 inline-block text-xs text-[var(--accent)] underline"
                        >
                          open on Quizlet
                        </a>
                      )}
                      <div className="flex flex-col gap-2">
                        {detail.cards.map((c) => (
                          <div
                            key={c.id}
                            className="rounded-2xl border border-[var(--border)] bg-[var(--accent)]/[0.04] px-3.5 py-2.5"
                          >
                            <p className="font-semibold text-[var(--foreground)]">
                              {c.term}
                            </p>
                            <p className="mt-1 text-sm leading-relaxed text-[var(--muted)]">
                              {c.definition}
                            </p>
                          </div>
                        ))}
                        {detail.cards.length === 0 && (
                          <p className="py-4 text-center text-sm text-[var(--muted)]">
                            This set has no cards.
                          </p>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
