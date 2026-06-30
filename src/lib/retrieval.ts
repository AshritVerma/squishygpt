import { query, toVector } from "./db";
import { embed } from "./embeddings";

export interface RetrievedChunk {
  content: string;
  term: string;
  definition: string;
  set_title: string;
  set_id: number;
  score: number;
}

export interface Source {
  setId: number;
  setTitle: string;
}

/** Embed the question and return the top-k most similar cards (cosine). */
export async function retrieve(
  questionText: string,
  k = 8,
): Promise<RetrievedChunk[]> {
  const vector = toVector(await embed(questionText));
  return query<RetrievedChunk>(
    `SELECT ch.content,
            c.term,
            c.definition,
            s.title AS set_title,
            s.id    AS set_id,
            1 - (ch.embedding <=> $1::vector) AS score
     FROM chunks ch
     JOIN cards c ON c.id = ch.card_id
     JOIN sets  s ON s.id = ch.set_id
     ORDER BY ch.embedding <=> $1::vector
     LIMIT $2`,
    [vector, k],
  );
}

export function buildContext(chunks: RetrievedChunk[]): string {
  if (chunks.length === 0) return "(No matching flashcards were found.)";
  return chunks
    .map(
      (ch, i) =>
        `[Card ${i + 1}] (from set: ${ch.set_title})\n${ch.term}\n${ch.definition}`,
    )
    .join("\n\n");
}

export function uniqueSources(chunks: RetrievedChunk[]): Source[] {
  const seen = new Map<number, string>();
  for (const ch of chunks) {
    if (!seen.has(ch.set_id)) seen.set(ch.set_id, ch.set_title);
  }
  return Array.from(seen.entries()).map(([setId, setTitle]) => ({
    setId,
    setTitle,
  }));
}
