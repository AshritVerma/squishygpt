"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { SquishyMascot, MascotMood } from "./SquishyMascot";
import { SetModal } from "./SetModal";

export interface Source {
  setId: number;
  setTitle: string;
}

export interface ChatMsg {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
  pending?: boolean;
}

export function MessageBubble({
  message,
  mood = "idle",
}: {
  message: ChatMsg;
  /** Mood for the mascot avatar next to assistant messages. */
  mood?: MascotMood;
}) {
  const isUser = message.role === "user";
  const [openSetId, setOpenSetId] = useState<number | null>(null);

  return (
    <div
      className={`flex w-full items-end gap-2 ${
        isUser ? "justify-end" : "justify-start"
      }`}
    >
      {!isUser && (
        <div className="bubble-in -mb-1 shrink-0">
          <SquishyMascot size={52} interactive={false} mood={mood} />
        </div>
      )}
      <div
        className={`bubble-in max-w-[88%] sm:max-w-[75%] rounded-3xl px-4 py-3 text-[15px] leading-relaxed squish-shadow ${
          isUser
            ? "accent-gradient text-white rounded-br-lg"
            : "glass text-[var(--foreground)] rounded-bl-lg"
        }`}
      >
        {message.pending && !message.content ? (
          <div className="flex items-center gap-1.5 py-1">
            <span className="typing-dot h-2 w-2 rounded-full bg-[var(--accent)]" />
            <span
              className="typing-dot h-2 w-2 rounded-full bg-[var(--accent)]"
              style={{ animationDelay: "0.2s" }}
            />
            <span
              className="typing-dot h-2 w-2 rounded-full bg-[var(--accent)]"
              style={{ animationDelay: "0.4s" }}
            />
          </div>
        ) : isUser ? (
          <p className="whitespace-pre-wrap">{message.content}</p>
        ) : (
          <div className="prose-squish">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {message.content}
            </ReactMarkdown>
          </div>
        )}

        {!isUser && message.sources && message.sources.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-[var(--border)] pt-2.5">
            <span className="text-xs font-medium text-[var(--muted)]">
              From your sets:
            </span>
            {message.sources.map((s) => (
              <button
                key={s.setId}
                onClick={() => setOpenSetId(s.setId)}
                title={`Open "${s.setTitle}"`}
                className="spring inline-flex items-center gap-1 rounded-full bg-[var(--accent)]/12 px-2 py-0.5 text-xs font-medium text-[var(--accent)] transition hover:bg-[var(--accent)]/25"
              >
                {s.setTitle}
                <svg
                  width="11"
                  height="11"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M7 17 17 7" />
                  <path d="M7 7h10v10" />
                </svg>
              </button>
            ))}
          </div>
        )}
      </div>

      {openSetId != null && (
        <SetModal setId={openSetId} onClose={() => setOpenSetId(null)} />
      )}
    </div>
  );
}
