"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MessageBubble, ChatMsg, Source } from "./MessageBubble";
import { VoiceButton } from "./VoiceButton";
import { SquishyMascot } from "./SquishyMascot";
import { FloatingDoodles } from "./FloatingDoodles";
import { Confetti } from "./Confetti";
import { Arcade, syncArcadeBests } from "./arcade/Arcade";
import { fetchClientState, pushClientState } from "@/lib/clientState";
import { QUESTION_COUNT_KEY, mascotLevel } from "@/lib/milestones";
import { track } from "@/lib/analyticsClient";

const DEFAULT_SUGGESTIONS = [
  "Differentials for a painful red eye",
  "Signs of acute angle-closure glaucoma",
  "How do I tell CRAO from CRVO?",
  "Management of a corneal ulcer",
];

const SUG_KEY = "squishygpt.suggestions.v1";
const SUG_TTL = 1000 * 60 * 60 * 4; // refresh personalized prompts every 4h
const FACT_KEY = "squishygpt.factdismissed.v1"; // date-stamped so it returns daily

// Tiny delightful eye facts, one shown per day on the empty state.
const EYE_FACTS = [
  "Your cornea has no blood supply — it gets oxygen straight from the air.",
  "The eye can distinguish about 10 million different colors.",
  "Rods outnumber cones roughly 20 to 1 in the human retina.",
  "Your eyes blink about 15–20 times a minute — that's millions a year.",
  "The retina processes images upside down; your brain flips them.",
  "The optic nerve has over a million nerve fibers.",
  "Newborns don't produce tears until about 3–4 weeks old.",
  "The fovea is only about 0.3 mm wide but gives you sharpest vision.",
  "Heterochromia is having two differently colored irises.",
  "Your eyes can detect a single photon in the dark.",
  "The lens keeps growing throughout your life.",
  "Corneas are among the few tissues that can be transplanted by almost anyone.",
  "The blind spot exists where the optic nerve exits the retina.",
  "Carrots help vision because of vitamin A — but won't give you super sight.",
  "Pupils dilate up to 45% when you look at someone you love.",
  "20/20 vision means normal, not perfect — some people see 20/10.",
  "The muscles that move your eyes are the fastest in your body.",
  "Tears have three layers: oily, watery, and mucous.",
];

function factOfTheDay(): string {
  const start = new Date(new Date().getFullYear(), 0, 0);
  const day = Math.floor((Date.now() - start.getTime()) / 86400000);
  return EYE_FACTS[day % EYE_FACTS.length];
}

function todayStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function uid() {
  return Math.random().toString(36).slice(2);
}

// Conversations are cached in localStorage and synced to the server
// (client_state table), so history follows Serena across devices/domains.
interface StoredConvo {
  id: string;
  title: string;
  updatedAt: number;
  messages: ChatMsg[];
}

const STORAGE_KEY = "squishygpt.conversations.v1";
const CONVOS_STATE_KEY = "conversations";
const MAX_CONVOS = 50;

function readConvos(): StoredConvo[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredConvo[]) : [];
  } catch {
    return [];
  }
}

let pushTimer: number | undefined;

function writeConvos(list: StoredConvo[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    /* storage full or unavailable — history just won't persist locally */
  }
  // Debounced server sync (streaming updates fire this on every chunk).
  window.clearTimeout(pushTimer);
  pushTimer = window.setTimeout(
    () => pushClientState(CONVOS_STATE_KEY, list),
    1500,
  );
}

/** Merge local and server histories: union by id, newest updatedAt wins. */
function mergeConvos(a: StoredConvo[], b: StoredConvo[]): StoredConvo[] {
  const byId = new Map<string, StoredConvo>();
  for (const c of [...a, ...b]) {
    const prev = byId.get(c.id);
    if (!prev || c.updatedAt > prev.updatedAt) byId.set(c.id, c);
  }
  return [...byId.values()]
    .sort((x, y) => y.updatedAt - x.updatedAt)
    .slice(0, MAX_CONVOS);
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
  const [confetti, setConfetti] = useState(false);
  const [factHidden, setFactHidden] = useState(true);
  const [arcadeOpen, setArcadeOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const celebrate = useCallback(() => {
    if (prefersReducedMotion()) return;
    setConfetti(false);
    requestAnimationFrame(() => setConfetti(true));
  }, []);

  // Load saved conversations once on mount: show the local cache instantly,
  // then merge in the server copy so other devices' history appears too.
  useEffect(() => {
    const local = readConvos();
    setConvos(local);
    setFactHidden(localStorage.getItem(FACT_KEY) === todayStamp());
    fetchClientState<StoredConvo[]>(CONVOS_STATE_KEY).then((remote) => {
      const current = readConvos();
      if (!Array.isArray(remote) || remote.length === 0) {
        // Server has nothing yet — seed it from this device.
        if (current.length > 0) pushClientState(CONVOS_STATE_KEY, current);
        return;
      }
      const merged = mergeConvos(current, remote);
      setConvos(merged);
      writeConvos(merged);
    });
    // Sync arcade high scores too, so they carry over without opening the arcade.
    syncArcadeBests();
  }, []);

  // Confetti can also be triggered from elsewhere (e.g. Cleia's birthday).
  useEffect(() => {
    const onConfetti = () => celebrate();
    window.addEventListener("squishy:confetti", onConfetti);
    return () => window.removeEventListener("squishy:confetti", onConfetti);
  }, [celebrate]);

  // Cleia's triple-tap easter egg opens the arcade.
  useEffect(() => {
    const openArcade = () => setArcadeOpen(true);
    window.addEventListener("squishy:arcade-request", openArcade);
    return () =>
      window.removeEventListener("squishy:arcade-request", openArcade);
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
    track("new_chat");
    setMessages([]);
    setConvId(uid());
    setPanelOpen(false);
  }

  function loadConvo(c: StoredConvo) {
    if (busy) return;
    track("conversation_loaded", { messages: c.messages.length });
    setMessages(c.messages);
    setConvId(c.id);
    setPanelOpen(false);
  }

  function deleteConvo(id: string) {
    track("conversation_deleted");
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
    navigator.vibrate?.(10);

    // Secret words send Cleia into a happy frenzy (message still sends).
    if (/\b(woof+|good\s*girl|cleia|squishy)\b/i.test(question)) {
      window.dispatchEvent(new Event("squishy:feral"));
    }

    // "20/20" anywhere in a question gives Squishy star eyes + confetti.
    if (/\b20\s*\/\s*20\b/.test(question)) {
      window.dispatchEvent(new Event("squishy:2020"));
      window.dispatchEvent(new Event("squishy:confetti"));
    }

    // Complimenting the brain makes it bashful.
    if (
      /\b(good\s+(job|work|brain)|smart\s+(brain|squishy)|so\s+smart|thank\s+(you|u)|thanks|thx)\b/i.test(
        question,
      )
    ) {
      window.dispatchEvent(new Event("squishy:bashful"));
    }

    // Milestones: confetti + a proud Cleia every 50th question, and Squishy
    // evolves (cap at 250, stethoscope at 500 — see lib/milestones).
    try {
      const n =
        (parseInt(localStorage.getItem(QUESTION_COUNT_KEY) || "0", 10) || 0) +
        1;
      localStorage.setItem(QUESTION_COUNT_KEY, String(n));
      if (n % 50 === 0) window.dispatchEvent(new Event("squishy:confetti"));
      if (mascotLevel(n) > mascotLevel(n - 1)) {
        window.dispatchEvent(new Event("squishy:milestone"));
        window.dispatchEvent(new Event("squishy:confetti"));
      }
    } catch {
      /* counting is best-effort */
    }

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
    window.dispatchEvent(new Event("squishy:answer-start"));

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
      window.dispatchEvent(new Event("squishy:answer-done"));
    }
  }

  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    router.push("/login");
  }

  return (
    <div className="relative flex h-[100dvh] flex-col">
      <FloatingDoodles />
      {confetti && <Confetti onDone={() => setConfetti(false)} />}
      {arcadeOpen && <Arcade onClose={() => setArcadeOpen(false)} />}

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
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            onClick={() => setArcadeOpen(true)}
            aria-label="Open Cleia's arcade"
            className="spring flex h-10 w-10 items-center justify-center rounded-full text-[var(--muted)] transition hover:bg-[var(--accent)]/10 hover:text-[var(--accent)]"
          >
            <svg
              width="19"
              height="19"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="6" y1="11" x2="10" y2="11" />
              <line x1="8" y1="9" x2="8" y2="13" />
              <line x1="15" y1="12" x2="15.01" y2="12" />
              <line x1="18" y1="10" x2="18.01" y2="10" />
              <rect x="2" y="6" width="20" height="12" rx="6" />
            </svg>
          </button>
          <a
            href="/admin"
            className="whitespace-nowrap rounded-full px-3 py-2 text-xs font-medium text-[var(--muted)] transition duration-200 hover:-translate-y-0.5 hover:bg-[var(--accent)]/10 hover:text-[var(--accent)]"
          >
            Study sets
          </a>
          <button
            onClick={logout}
            className="whitespace-nowrap rounded-full px-3 py-2 text-xs font-medium text-[var(--muted)] transition duration-200 hover:-translate-y-0.5 hover:bg-[var(--accent)]/10 hover:text-[var(--accent)]"
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
                  onClick={() => {
                    track("suggestions_shuffled");
                    loadSuggestions(true);
                  }}
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
                    onClick={() => {
                      track("suggestion_clicked", { index: i });
                      send(s);
                    }}
                    style={{ animationDelay: `${120 + i * 90}ms` }}
                    className="glass glow-hover chip-in squish-shadow rounded-2xl px-4 py-3 text-left text-sm"
                  >
                    {s}
                  </button>
                ))}
              </div>
              {!factHidden && (
                <div className="chip-in mt-5 flex max-w-md items-start gap-2 px-1 text-left">
                  <span className="twinkle mt-0.5 shrink-0 text-sm">👁️</span>
                  <p className="text-xs leading-relaxed text-[var(--muted)]">
                    <span className="font-semibold text-[var(--accent)]">
                      Eye fact of the day:{" "}
                    </span>
                    {factOfTheDay()}
                  </p>
                  <button
                    onClick={() => {
                      setFactHidden(true);
                      try {
                        localStorage.setItem(FACT_KEY, todayStamp());
                      } catch {
                        /* ignore */
                      }
                    }}
                    aria-label="Dismiss eye fact"
                    className="shrink-0 rounded-full px-1.5 text-[var(--muted)] transition hover:text-[var(--accent)]"
                  >
                    ✕
                  </button>
                </div>
              )}
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
            onTranscript={(text, isFinal) => {
              setInput(text);
              requestAnimationFrame(autosize);
              if (isFinal) track("voice_transcript_used", { chars: text.length });
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
