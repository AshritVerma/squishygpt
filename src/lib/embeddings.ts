import OpenAI from "openai";

let _openai: OpenAI | null = null;
function openaiClient(): OpenAI {
  if (!_openai) {
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _openai;
}

export const EMBED_MODEL =
  process.env.OPENAI_EMBED_MODEL || "text-embedding-3-small";

// text-embedding-3-small => 1536 dimensions. If you change the model,
// update the vector(...) dimension in db/schema.sql to match.
export const EMBED_DIM = 1536;

export async function embed(text: string): Promise<number[]> {
  const res = await openaiClient().embeddings.create({
    model: EMBED_MODEL,
    input: text.replace(/\n/g, " ").slice(0, 8000),
  });
  return res.data[0].embedding;
}

export async function embedBatch(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const res = await openaiClient().embeddings.create({
    model: EMBED_MODEL,
    input: texts.map((t) => t.replace(/\n/g, " ").slice(0, 8000)),
  });
  return res.data
    .sort((a, b) => a.index - b.index)
    .map((d) => d.embedding);
}
