import { anthropicClient, CLAUDE_MODEL, SYSTEM_PROMPT } from "@/lib/anthropic";
import { retrieve, buildContext, uniqueSources } from "@/lib/retrieval";

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
  const readable = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of anthropicStream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            controller.enqueue(encoder.encode(event.delta.text));
          }
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
    },
  });
}
