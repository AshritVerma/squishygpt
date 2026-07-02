"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MessageBubble, ChatMsg, Source } from "./MessageBubble";
import { VoiceButton } from "./VoiceButton";
import { SquishyMascot } from "./SquishyMascot";
import { FloatingDoodles } from "./FloatingDoodles";

const DEFAULT_SUGGESTIONS = [
  "Differentials for a painful red eye",
  "Signs of acute angle-closure glaucoma",
  "How do I tell CRAO from CRVO?",
  "Management of a corneal ulcer",
];

const SUG_KEY = "squishygpt.suggestions.v1";
const SUG_TTL = 1000 * 60 * 60 * 4; // refresh personalized prompts every 4h

function uid() {
  return Math.random().toString(36).slice(2);
}

// Conversations are stored locally on the device (localStorage), newest first.
interface StoredConvo {
  id: string;
  title: string;
  updatedAt: number;
  messages: ChatMsg[];
}

const STORAGE_KEY = "squishygpt.conversations.v1";
const MAX_CONVOS = 50;

function readConvos(): StoredConvo[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredConvo[]) : [];
  } catch {
    return [];
  }
}

function writeConvos(list: StoredConvo[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    /* storage full or unavailable — history just won't persist */
  }
}

function timeAgo(ts: number): string {
  const mins = Math.floor((Date.now() - ts) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
}

export function Chat() {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [bursts, setBursts] = useState<number[]>([]);
  const [convId, setConvId] = useState(() => uid());
  const [convos, setConvos] = useState<StoredConvo[]>([]);
  const [panelOpen, setPanelOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>(DEFAULT_SUGGESTIONS);
  const [loadingSug, setLoadingSug] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Load saved conversations once on mount.
  useEffect(() => {
    setConvos(readConvos());
  }, []);

  // Personalized suggestions: generated from her cards + recent questions,
  // cached locally so we don't regenerate on every visit.
  const loadSuggestions = useCallback(async (force: boolean) => {
    try {
      if (!force) {
        const cached = localStorage.getItem(SUG_KEY);
        if (cached) {
          const c = JSON.parse(cached) as { at: number; items: string[] };
          if (c.items?.length && Date.now() - c.at < SUG_TTL) {
            setSuggestions(c.items);
            return;
          }
        }
      }
      setLoadingSug(true);
      // Recent questions across all saved conversations, newest first.
      const recentQuestions = readConvos()
        .flatMap((c) => c.messages.filter((m) => m.role === "user"))
        .slice(0, 15)
        .map((m) => m.content);
      const res = await fetch("/api/suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recentQuestions }),
      });
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data.suggestions) && data.suggestions.length > 0) {
        setSuggestions(data.suggestions);
        localStorage.setItem(
          SUG_KEY,
          JSON.stringify({ at: Date.now(), items: data.suggestions }),
        );
      }
    } catch {
      /* keep whatever suggestions we already show */
    } finally {
      setLoadingSug(false);
    }
  }, []);

  useEffect(() => {
    loadSuggestions(false);
  }, [loadSuggestions]);

  // Autosave the current conversation whenever it changes (skip empty and
  // still-pending placeholder messages).
  useEffect(() => {
    const clean = messages.filter((m) => !(m.pending && !m.content));
    if (clean.length === 0) return;
    const title =
      clean.find((m) => m.role === "user")?.content.slice(0, 60) ||
      "New conversation";
    setConvos((prev) => {
      const rest = prev.filter((c) => c.id !== convId);
      const next = [
        { id: convId, title, updatedAt: Date.now(), messages: clean },
        ...rest,
      ].slice(0, MAX_CONVOS);
      writeConvos(next);
      return next;
    });
  }, [messages, convId]);

  function newChat() {
    setMessages([]);
    setConvId(uid());
    setPanelOpen(false);
  }

  function loadConvo(c: StoredConvo) {
    if (busy) return;
    setMessages(c.messages);
    setConvId(c.id);
    setPanelOpen(false);
  }

  function deleteConvo(id: string) {
    setConvos((prev) => {
      const next = prev.filter((c) => c.id !== id);
      writeConvos(next);
      return next;
    });
    if (id === convId) {
      setMessages([]);
      setConvId(uid());
    }
  }

  function spawnBurst() {
    const id = Date.now() + Math.random();
    setBursts((b) => [...b, id]);
    window.setTimeout(
      () => setBursts((b) => b.filter((x) => x !== id)),
      1100,
    );
  }

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  function autosize() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  }

  async function send(text: string) {
    const question = text.trim();
    if (!question || busy) return;
    spawnBurst();

    const userMsg: ChatMsg = { id: uid(), role: "user", content: question };
    const assistantId = uid();
    const history = [...messages, userMsg];
    setMessages([
      ...history,
      { id: assistantId, role: "assistant", content: "", pending: true },
    ]);
    setInput("");
    setBusy(true);
    requestAnimationFrame(autosize);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: history.map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      if (res.status === 401) {
        router.push("/login");
        return;
      }
      if (!res.ok || !res.body) {
        throw new Error("Request failed");
      }

      let sources: Source[] = [];
      const header = res.headers.get("X-Sources");
      if (header) {
        try {
          sources = JSON.parse(atob(header));
        } catch {
          /* ignore */
        }
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, content: acc, pending: false } : m,
          ),
        );
      }

      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, content: acc, pending: false, sources }
            : m,
        ),
      );
    } catch {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? {
                ...m,
                pending: false,
                content:
                  "Sorry, I couldn't reach the brain just now. Please try again.",
              }
            : m,
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    router.push("/login");
  }

  return (
    <div className="relative flex h-[100dvh] flex-col">
      <FloatingDoodles />

      {/* History side panel */}
      <div
        onClick={() => setPanelOpen(false)}
        className={`fixed inset-0 z-30 bg-black/30 backdrop-blur-sm transition-opacity duration-300 ${
          panelOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />
      <aside
        className={`glass fixed left-0 top-0 z-40 flex h-full w-72 max-w-[85vw] flex-col transition-transform duration-300 ${
          panelOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between px-4 pb-2 pt-4">
          <h2 className="text-sm font-bold text-[var(--muted)]">
            Conversations
          </h2>
          <button
            onClick={() => setPanelOpen(false)}
            aria-label="Close history"
            className="rounded-full px-2 py-1 text-[var(--muted)] transition hover:bg-[var(--accent)]/10 hover:text-[var(--accent)]"
          >
            ✕
          </button>
        </div>
        <button
          onClick={newChat}
          className="accent-gradient spring mx-4 mb-3 rounded-2xl py-2.5 text-sm font-semibold text-white"
        >
          + New chat
        </button>
        <div className="scroll-area flex-1 overflow-y-auto px-3 pb-4">
          {convos.length === 0 ? (
            <p className="px-2 pt-4 text-center text-xs text-[var(--muted)]">
              No conversations yet — ask Squishy something!
            </p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {convos.map((c) => (
                <div
                  key={c.id}
                  className={`group flex items-center gap-1 rounded-2xl px-3 py-2.5 transition ${
                    c.id === convId
                      ? "bg-[var(--accent)]/12"
                      : "hover:bg-[var(--accent)]/8"
                  }`}
                >
                  <button
                    onClick={() => loadConvo(c)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <p className="truncate text-sm font-medium">{c.title}</p>
                    <p className="text-[11px] text-[var(--muted)]">
                      {timeAgo(c.updatedAt)}
                    </p>
                  </button>
                  <button
                    onClick={() => deleteConvo(c.id)}
                    aria-label="Delete conversation"
                    className="shrink-0 rounded-full px-2 py-1 text-xs text-[var(--muted)] opacity-60 transition hover:bg-rose-500/10 hover:text-rose-500 group-hover:opacity-100"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </aside>

      {/* Header */}
      <header className="glass sticky top-0 z-10 flex items-center justify-between px-3 py-3 sm:px-6">
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setPanelOpen(true)}
            aria-label="Open conversation history"
            className="spring flex h-9 w-9 items-center justify-center rounded-full text-[var(--muted)] transition hover:bg-[var(--accent)]/10 hover:text-[var(--accent)]"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <line x1="4" y1="7" x2="20" y2="7" />
              <line x1="4" y1="12" x2="20" y2="12" />
              <line x1="4" y1="17" x2="14" y2="17" />
            </svg>
          </button>
          <a href="/" className="flex items-center gap-2.5">
            <div className="float-y">
              <SquishyMascot size={40} interactive={false} />
            </div>
            <div className="leading-tight">
              <h1 className="text-lg font-extrabold tracking-tight">
                <span className="accent-text">SquishyGPT</span>
              </h1>
              <p className="text-[11px] text-[var(--muted)]">
                Serena&apos;s optometry brain
              </p>
            </div>
          </a>
        </div>
        <div className="flex items-center gap-1">
          <a
            href="/admin"
            className="rounded-full px-3 py-1.5 text-xs font-medium text-[var(--muted)] transition duration-200 hover:-translate-y-0.5 hover:bg-[var(--accent)]/10 hover:text-[var(--accent)]"
          >
            Study sets
          </a>
          <button
            onClick={logout}
            className="rounded-full px-3 py-1.5 text-xs font-medium text-[var(--muted)] transition duration-200 hover:-translate-y-0.5 hover:bg-[var(--accent)]/10 hover:text-[var(--accent)]"
          >
            Sign out
          </button>
        </div>
      </header>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="scroll-area flex-1 overflow-y-auto px-3 py-5 sm:px-6"
      >
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
          {messages.length === 0 ? (
            <div className="mt-10 flex flex-col items-center text-center sm:mt-20">
              <div className="mb-3">
                <SquishyMascot size={216} greeting="Hi Squishy! 👋" />
              </div>
              <h2 className="text-xl font-bold">Your optometry brain is ready</h2>
              <p className="mt-1 max-w-sm text-sm text-[var(--muted)]">
                Ask me anything from your optometry sets. Type it or tap the mic
                and speak. (Psst — tap me, I&apos;ll wave back.)
              </p>
              <div className="mt-6 flex w-full max-w-md items-center justify-between px-1">
                <span className="text-xs font-medium text-[var(--muted)]">
                  {loadingSug ? "Finding what's relevant…" : "Suggested for you"}
                </span>
                <button
                  onClick={() => loadSuggestions(true)}
                  disabled={loadingSug}
                  aria-label="Refresh suggestions"
                  className="spring flex items-center gap-1 rounded-full px-2 py-1 text-xs text-[var(--muted)] transition hover:bg-[var(--accent)]/10 hover:text-[var(--accent)] disabled:opacity-50"
                >
                  <svg
                    width="13"
                    height="13"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className={loadingSug ? "animate-spin" : ""}
                  >
                    <path d="M21 12a9 9 0 1 1-2.64-6.36" />
                    <path d="M21 3v6h-6" />
                  </svg>
                  Shuffle
                </button>
              </div>
              <div
                className={`mt-2 grid w-full max-w-md grid-cols-1 gap-2 transition-opacity sm:grid-cols-2 ${
                  loadingSug ? "opacity-60" : "opacity-100"
                }`}
              >
                {suggestions.map((s, i) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    style={{ animationDelay: `${120 + i * 90}ms` }}
                    className="glass glow-hover chip-in squish-shadow rounded-2xl px-4 py-3 text-left text-sm"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m, i) => (
              <MessageBubble
                key={m.id}
                message={m}
                mood={
                  m.role !== "assistant"
                    ? undefined
                    : m.pending
                      ? "thinking"
                      : busy && i === messages.length - 1
                        ? "talking"
                        : "idle"
                }
              />
            ))
          )}
        </div>
      </div>

      {/* Composer */}
      <div className="px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 sm:px-6">
        <div className="mx-auto flex w-full max-w-2xl items-end gap-2">
          <VoiceButton
            disabled={busy}
            onTranscript={(text) => {
              setInput(text);
              requestAnimationFrame(autosize);
            }}
          />
          <div className="glass squish-shadow composer flex flex-1 items-end gap-2 rounded-3xl px-3 py-2">
            <textarea
              ref={textareaRef}
              value={input}
              rows={1}
              placeholder="Ask your optometry brain…"
              onChange={(e) => {
                setInput(e.target.value);
                autosize();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
              className="max-h-40 flex-1 resize-none bg-transparent py-1.5 text-[15px] outline-none placeholder:text-[var(--muted)]"
            />
            <div className="relative shrink-0">
              {/* heart burst on send */}
              {bursts.map((id) => (
                <div
                  key={id}
                  className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center"
                >
                  {[0, 1, 2, 3, 4].map((n) => (
                    <span
                      key={n}
                      className="heart-up absolute text-sm"
                      style={{
                        left: `${(n - 2) * 9}px`,
                        animationDelay: `${n * 70}ms`,
                      }}
                    >
                      {n % 2 === 0 ? "🩷" : "✨"}
                    </span>
                  ))}
                </div>
              ))}
              <button
                onClick={() => send(input)}
                disabled={busy || !input.trim()}
                aria-label="Send"
                className={`accent-gradient spring flex h-9 w-9 items-center justify-center rounded-full text-white disabled:opacity-40 ${
                  input.trim() && !busy ? "send-live" : ""
                }`}
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="12" y1="19" x2="12" y2="5" />
                  <polyline points="5 12 12 5 19 12" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
