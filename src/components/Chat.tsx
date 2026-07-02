"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MessageBubble, ChatMsg, Source } from "./MessageBubble";
import { VoiceButton } from "./VoiceButton";

const SUGGESTIONS = [
  "Differentials for a painful red eye",
  "Signs of acute angle-closure glaucoma",
  "How do I tell CRAO from CRVO?",
  "Management of a corneal ulcer",
];

function uid() {
  return Math.random().toString(36).slice(2);
}

export function Chat() {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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
    <div className="flex h-[100dvh] flex-col">
      {/* Header */}
      <header className="glass sticky top-0 z-10 flex items-center justify-between px-4 py-3 sm:px-6">
        <div className="flex items-center gap-2.5">
          <div className="accent-gradient float-y flex h-9 w-9 items-center justify-center rounded-2xl text-lg squish-shadow">
            🩷
          </div>
          <div className="leading-tight">
            <h1 className="text-lg font-extrabold tracking-tight">
              <span className="accent-text">SquishyGPT</span>
            </h1>
            <p className="text-[11px] text-[var(--muted)]">
              Serena&apos;s optometry brain
            </p>
          </div>
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
            <div className="mt-6 flex flex-col items-center text-center sm:mt-16">
              <div className="accent-gradient breathe mb-4 flex h-16 w-16 items-center justify-center rounded-3xl text-3xl squish-shadow">
                🩷
              </div>
              <h2 className="text-xl font-bold">Hi Squishy 👋</h2>
              <p className="mt-1 max-w-sm text-sm text-[var(--muted)]">
                Ask me anything from your optometry sets. Type it or tap the mic
                and speak.
              </p>
              <div className="mt-6 grid w-full max-w-md grid-cols-1 gap-2 sm:grid-cols-2">
                {SUGGESTIONS.map((s, i) => (
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
            messages.map((m) => <MessageBubble key={m.id} message={m} />)
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
            <button
              onClick={() => send(input)}
              disabled={busy || !input.trim()}
              aria-label="Send"
              className={`accent-gradient spring flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white disabled:opacity-40 ${
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
  );
}
