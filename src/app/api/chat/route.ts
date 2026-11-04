import {
  anthropicClient,
  birthdayPromptAddendum,
  CLAUDE_MODEL,
  SYSTEM_PROMPT,
} from "@/lib/anthropic";
import {
  retrieveWithFallback,
  buildContext,
  uniqueSources,
  retrievedImages,
} from "@/lib/retrieval";
import { isBirthdayInNY } from "@/lib/birthday";

export const runtime = "nodejs";
export const maxDuration = 60;

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

function jsonError(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Turn an upstream Claude failure into something Serena can act on. She is the
 * only user and also the account owner, so "out of credits" vs. "overloaded"
 * is the difference between fixing it and waiting.
 */
function upstreamError(err: unknown): Response {
  const status =
    typeof err === "object" && err !== null && "status" in err
      ? Number((err as { status?: unknown }).status)
      : 0;

  if (status === 401 || status === 403) {
    return jsonError(
      "My Claude API key isn't working — it may need to be updated.",
      502,
    );
  }
  if (status === 400) {
    return jsonError(
      "Claude rejected that request. Starting a new chat usually clears it.",
      502,
    );
  }
  if (status === 429) {
    return jsonError(
      "I'm out of Claude credits or being rate limited right now. Check the Anthropic billing page, or try again in a minute.",
      429,
    );
  }
  if (status === 529 || status >= 500) {
    return jsonError("Claude is overloaded right now. Try again in a moment.", 503);
  }
  return jsonError(
    "I couldn't reach Claude just now. Please try again in a moment.",
    502,
  );
}

export async function POST(req: Request) {
  let messages: ChatMessage[] = [];
  try {
    const body = await req.json();
    messages = Array.isArray(body?.messages) ? body.messages : [];
  } catch {
    return jsonError("Invalid request", 400);
  }

  // Find the question by index (not by reversing) so everything before it can
  // become history without the risk of duplicating the question itself.
  const lastUserIdx = messages.reduce(
    (found, m, i) => (m?.role === "user" ? i : found),
    -1,
  );
  if (lastUserIdx === -1) {
    return jsonError("No question provided", 400);
  }
  const last = messages[lastUserIdx];
  if (typeof last.content !== "string" || !last.content.trim()) {
    return jsonError("No question provided", 400);
  }

  // Claude rejects empty turns and histories that don't start with a user
  // turn. Synced conversation history is client-supplied and has held both
  // (an interrupted stream leaves an empty assistant bubble), which used to
  // fail every later turn in that conversation. Sanitize instead of trusting.
  const history: ChatMessage[] = messages
    .slice(0, lastUserIdx)
    .filter(
      (m): m is ChatMessage =>
        (m?.role === "user" || m?.role === "assistant") &&
        typeof m.content === "string" &&
        m.content.trim().length > 0,
    )
    // Drop [[image:N]] markers from prior turns: N is keyed to that turn's card
    // numbering, which is meaningless now and would confuse the model.
    .map((m) => ({
      role: m.role,
      content: m.content.replace(/^\s*\[\[image:\d+\]\]\s*$/gim, "").trim(),
    }))
    .filter((m) => m.content.length > 0);
  while (history.length > 0 && history[0].role === "assistant") history.shift();

  // RAG retrieval over Serena's study sets. Degrades to keyword search, then
  // to no context — an answer without citations beats no answer at all.
  const { chunks, mode } = await retrieveWithFallback(last.content, 8);
  const context = buildContext(chunks);
  const sources = mode === "vector" ? uniqueSources(chunks) : [];
  // Images come from her real cards, so send them in every retrieval mode.
  const images = retrievedImages(chunks);

  // When grounding is degraded, say so in the prompt. Otherwise the model has
  // no way to know its context is weak and may over-trust it — the system
  // prompt forbids implying something is in her sets when it isn't.
  const groundingNote =
    mode === "vector"
      ? ""
      : mode === "keyword"
        ? "\n\nNOTE: semantic search is down, so these cards were matched by keyword and may be only loosely related. Use them only where they genuinely fit, lean on your general optometry knowledge otherwise, and mention that set matching is degraded right now."
        : "\n\nNOTE: her study sets could not be searched for this question, so no flashcards are attached. Answer from your general optometry knowledge and tell her this answer is not drawn from her sets.";

  const augmented = {
    role: "user" as const,
    content: `Use the following flashcards from Serena's optometry study sets as your primary CONTEXT.\n\nCONTEXT:\n${context}${groundingNote}\n\nQUESTION: ${last.content}`,
  };

  const system = isBirthdayInNY()
    ? SYSTEM_PROMPT + birthdayPromptAddendum()
    : SYSTEM_PROMPT;

  // Creating the client throws on a missing API key, so it belongs in the try.
  let anthropicStream;
  try {
    anthropicStream = await anthropicClient().messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 1024,
      system,
      messages: [...history, augmented],
      stream: true,
    });
  } catch (err) {
    console.error("Claude request failed:", err);
    return upstreamError(err);
  }

  const encoder = new TextEncoder();
  const readable = new ReadableStream<Uint8Array>({
    async start(controller) {
      let sentText = false;
      try {
        for await (const event of anthropicStream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            sentText = true;
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
        // A stream that ends without any text would render as an empty
        // bubble, which then poisons the history of every later turn.
        if (!sentText) {
          controller.enqueue(
            encoder.encode("_(Claude returned an empty answer. Try asking again.)_"),
          );
        }
      } catch (err) {
        controller.enqueue(
          encoder.encode(
            "\n\n_(Sorry, something went wrong generating that answer.)_",
          ),
        );
        console.error("Chat stream error:", err);
      } finally {
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      // Sources are small JSON, sent up-front in a header so the UI can show
      // which study sets the answer drew from.
      "X-Sources": Buffer.from(JSON.stringify(sources)).toString("base64"),
      // Images on retrieved cards, numbered to match the [[image:N]] markers in
      // the answer. Base64 JSON, same pattern as X-Sources.
      "X-Images": Buffer.from(JSON.stringify(images)).toString("base64"),
      // "vector" | "keyword" | "none" — lets the UI flag a degraded answer.
      "X-Retrieval-Mode": mode,
    },
  });
}
