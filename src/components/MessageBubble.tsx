"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

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

export function MessageBubble({ message }: { message: ChatMsg }) {
  const isUser = message.role === "user";

  return (
    <div className={`flex w-full ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[88%] sm:max-w-[75%] rounded-3xl px-4 py-3 text-[15px] leading-relaxed squish-shadow ${
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
          <div className="mt-3 flex flex-wrap gap-1.5 border-t border-[var(--border)] pt-2.5">
            <span className="text-xs font-medium text-[var(--muted)]">
              From your sets:
            </span>
            {message.sources.map((s) => (
              <span
                key={s.setId}
                className="rounded-full bg-[var(--accent)]/12 px-2 py-0.5 text-xs font-medium text-[var(--accent)]"
              >
                {s.setTitle}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
