"use client";

import { useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { SquishyMascot, MascotMood } from "./SquishyMascot";
import { SetModal } from "./SetModal";
import { ImageLightbox, LightboxImage } from "./ImageLightbox";

export interface Source {
  setId: number;
  setTitle: string;
}

/** An image attached to a retrieved card, numbered to match [[image:N]]. */
export interface AnswerImage {
  n: number;
  id: number;
  caption: string;
  term: string;
  setTitle: string;
}

export interface ChatMsg {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
  /** Images on retrieved cards; some placed inline, the rest shown in a strip. */
  images?: AnswerImage[];
  pending?: boolean;
  /** Caveat shown above the answer, e.g. when set matching was degraded. */
  notice?: string;
}

const IMAGE_MARKER = /\[\[image:(\d+)\]\]/g;
// A partial marker still being streamed, e.g. "[[image:1" — hidden until done.
const PARTIAL_MARKER = /\[\[(?:i(?:m(?:a(?:g(?:e(?::\d*)?)?)?)?)?)?$/;

/** A single image that opens a lightbox on tap. */
function CardImage({
  image,
  onOpen,
  variant,
}: {
  image: AnswerImage;
  onOpen: (img: LightboxImage) => void;
  variant: "inline" | "thumb";
}) {
  const lightbox: LightboxImage = {
    src: `/api/card-images/${image.id}`,
    caption: image.caption,
    term: image.term,
    setTitle: image.setTitle,
  };
  if (variant === "inline") {
    return (
      <button
        onClick={() => onOpen(lightbox)}
        className="spring my-2 block w-full overflow-hidden rounded-2xl border border-[var(--border)]"
        title={image.caption}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={lightbox.src}
          alt={image.caption || image.term}
          loading="lazy"
          className="max-h-72 w-full bg-black/5 object-contain"
        />
      </button>
    );
  }
  return (
    <button
      onClick={() => onOpen(lightbox)}
      className="spring shrink-0 overflow-hidden rounded-xl border border-[var(--border)]"
      title={image.caption}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={lightbox.src}
        alt={image.caption || image.term}
        loading="lazy"
        className="h-20 w-20 bg-black/5 object-cover"
      />
    </button>
  );
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
  const [lightbox, setLightbox] = useState<LightboxImage | null>(null);

  // Split the answer into markdown segments interleaved with inline images,
  // and figure out which images were NOT placed inline (they go in the strip).
  const { segments, placed } = useMemo(() => {
    const byN = new Map<number, AnswerImage>();
    for (const img of message.images ?? []) byN.set(img.n, img);

    // While streaming, hide a trailing partial "[[image:..." so it can't flash.
    let text = message.content;
    if (message.pending) text = text.replace(PARTIAL_MARKER, "");

    const segs: Array<
      { type: "text"; text: string } | { type: "image"; image: AnswerImage }
    > = [];
    const used = new Set<number>();
    let lastIndex = 0;
    for (const m of text.matchAll(IMAGE_MARKER)) {
      const n = Number(m[1]);
      const img = byN.get(n);
      const start = m.index ?? 0;
      // Keep the preceding text regardless; only emit an image for a real N.
      const before = text.slice(lastIndex, start);
      if (before) segs.push({ type: "text", text: before });
      if (img && !used.has(n)) {
        segs.push({ type: "image", image: img });
        used.add(n);
      }
      lastIndex = start + m[0].length;
    }
    const tail = text.slice(lastIndex);
    if (tail) segs.push({ type: "text", text: tail });

    const rest = (message.images ?? []).filter((img) => !used.has(img.n));
    return { segments: segs, placed: rest };
  }, [message.content, message.images, message.pending]);

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
          <div className="snellen py-1" aria-label="Reading your chart…">
            {[
              { t: "E", s: 15, d: 0 },
              { t: "F P", s: 12, d: 0.18 },
              { t: "T O Z", s: 9.5, d: 0.36 },
              { t: "L P E D", s: 7.5, d: 0.54 },
            ].map((r) => (
              <span
                key={r.t}
                style={{ fontSize: r.s, animationDelay: `${r.d}s` }}
              >
                {r.t}
              </span>
            ))}
          </div>
        ) : isUser ? (
          <p className="whitespace-pre-wrap">{message.content}</p>
        ) : (
          <>
            {message.notice && (
              <p className="mb-2 flex items-start gap-1.5 rounded-xl bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-600 dark:text-amber-400">
                <span aria-hidden="true">⚠️</span>
                <span>{message.notice}</span>
              </p>
            )}
            <div className="prose-squish">
              {segments.map((seg, i) =>
                seg.type === "text" ? (
                  <ReactMarkdown key={i} remarkPlugins={[remarkGfm]}>
                    {seg.text}
                  </ReactMarkdown>
                ) : (
                  <CardImage
                    key={i}
                    image={seg.image}
                    variant="inline"
                    onOpen={setLightbox}
                  />
                ),
              )}
            </div>

            {!message.pending && placed.length > 0 && (
              <div className="mt-3 border-t border-[var(--border)] pt-2.5">
                <span className="text-xs font-medium text-[var(--muted)]">
                  From your cards:
                </span>
                <div className="scroll-area mt-1.5 flex gap-2 overflow-x-auto pb-1">
                  {placed.map((img) => (
                    <CardImage
                      key={img.id}
                      image={img}
                      variant="thumb"
                      onOpen={setLightbox}
                    />
                  ))}
                </div>
              </div>
            )}
          </>
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

      {lightbox && (
        <ImageLightbox image={lightbox} onClose={() => setLightbox(null)} />
      )}
    </div>
  );
}
