import { anthropicClient, CLAUDE_MODEL, SYSTEM_PROMPT } from "@/lib/anthropic";
import { retrieve, buildContext, uniqueSources } from "@/lib/retrieval";
import { trackServer } from "@/lib/analytics-server";

export const runtime = "nodejs";
export const maxDuration = 60;

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export async function POST(req: Request) {
  let messages: ChatMessage[] = [];
  try {
    const body = await req.json();
    messages = Array.isArray(body?.messages) ? body.messages : [];
  } catch {
    return new Response(JSON.stringify({ error: "Invalid request" }), {
      status: 400,
    });
  }

  const last = [...messages].reverse().find((m) => m.role === "user");
  if (!last) {
    return new Response(JSON.stringify({ error: "No question provided" }), {
      status: 400,
    });
  }

  // RAG retrieval over Serena's study sets.
  const chunks = await retrieve(last.content, 8);
  const context = buildContext(chunks);
  const sources = uniqueSources(chunks);

  // Keep prior turns, augment only the latest user turn with retrieved context.
  const history = messages
    .slice(0, -1)
    .map((m) => ({ role: m.role, content: m.content }));
  const augmented = {
    role: "user" as const,
    content: `Use the following flashcards from Serena's optometry study sets as your primary CONTEXT.\n\nCONTEXT:\n${context}\n\nQUESTION: ${last.content}`,
  };

  const anthropicStream = await anthropicClient().messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [...history, augmented],
    stream: true,
  });

  const encoder = new TextEncoder();
  const startedAt = Date.now();
  let inputTokens = 0;
  let outputTokens = 0;
  let ok = true;
  const readable = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of anthropicStream) {
          if (event.type === "message_start") {
            inputTokens = event.message.usage.input_tokens ?? 0;
          } else if (event.type === "message_delta") {
            outputTokens = event.usage.output_tokens ?? outputTokens;
          } else if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
      } catch (err) {
        ok = false;
        controller.enqueue(
          encoder.encode(
            "\n\n_(Sorry, something went wrong generating that answer.)_",
          ),
        );
        console.error("Chat stream error:", err);
      } finally {
        controller.close();
        // Reliable server-side usage capture (can't be ad-blocked). Records
        // shape/perf, never the question text itself.
        void trackServer("chat_question_asked", {
          q_len: last.content.length,
          num_sources: sources.length,
          source_set_ids: sources.map((s) => s.setId),
          latency_ms: Date.now() - startedAt,
          model: CLAUDE_MODEL,
          input_tokens: inputTokens,
          output_tokens: outputTokens,
          ok,
        });
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
    },
  });
}
