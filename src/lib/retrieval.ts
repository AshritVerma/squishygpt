import { query, toVector } from "./db";
import { embed } from "./embeddings";

export interface ChunkImage {
  id: number;
  caption: string;
}

export interface RetrievedChunk {
  content: string;
  term: string;
  definition: string;
  set_title: string;
  set_id: number;
  score: number;
  images: ChunkImage[];
}

export interface Source {
  setId: number;
  setTitle: string;
}

/** An image shown with an answer, numbered to match the [[image:N]] markers. */
export interface AnswerImage {
  n: number;
  id: number;
  caption: string;
  term: string;
  setTitle: string;
}

// Shared SQL fragment: aggregate a card's images into a json array. Depends on
// a `c` alias for the cards row being in scope.
const IMAGES_JSON = `COALESCE(
  json_agg(
    json_build_object('id', ci.id, 'caption', ci.caption) ORDER BY ci.side
  ) FILTER (WHERE ci.id IS NOT NULL),
  '[]'
) AS images`;

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
            1 - (ch.embedding <=> $1::vector) AS score,
            ${IMAGES_JSON}
     FROM chunks ch
     JOIN cards c ON c.id = ch.card_id
     JOIN sets  s ON s.id = ch.set_id
     LEFT JOIN card_images ci ON ci.card_id = c.id
     GROUP BY ch.id, ch.content, c.term, c.definition, s.title, s.id, ch.embedding
     ORDER BY ch.embedding <=> $1::vector
     LIMIT $2`,
    [vector, k],
  );
}

// Words that carry no signal in a lexical search. Postgres' own english
// dictionary strips most of these, but dropping them here keeps the tsquery
// short and stops a question like "how do I tell X from Y?" from matching
// every card that happens to contain "tell".
const KEYWORD_STOPWORDS = new Set([
  "the", "and", "for", "are", "was", "were", "with", "what", "when", "which",
  "who", "whom", "how", "why", "does", "did", "doing", "you", "your", "its",
  "this", "that", "these", "those", "from", "into", "than", "then", "them",
  "there", "here", "have", "has", "had", "can", "could", "should", "would",
  "will", "about", "between", "vs", "versus", "tell", "explain", "describe",
  "give", "show", "list", "any", "all", "some", "more", "most", "not", "but",
]);

/**
 * Turn free text into a safe OR'd tsquery ("glaucoma | angle | closure").
 *
 * OR rather than AND because a full question rarely shares every word with a
 * flashcard; we want the best partial match, ranked. Input is reduced to
 * alphanumeric tokens, so the result is always a valid `to_tsquery` argument
 * and can never be injected.
 */
export function toKeywordQuery(text: string): string {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 2 && !KEYWORD_STOPWORDS.has(w));
  return [...new Set(words)].slice(0, 12).join(" | ");
}

/**
 * Lexical fallback for when embeddings are unavailable (quota exhausted,
 * OpenAI outage). Runs entirely inside Postgres, so her answers stay grounded
 * in her own cards even with no embedding provider reachable.
 *
 * Reads `cards` directly rather than `chunks`, so it also works for cards
 * whose embeddings were never written. Matches on term + definition, with
 * term hits weighted higher since those are the more on-topic cards.
 */
export async function retrieveByKeyword(
  questionText: string,
  k = 8,
): Promise<RetrievedChunk[]> {
  const tsquery = toKeywordQuery(questionText);
  if (!tsquery) return [];
  return query<RetrievedChunk>(
    `SELECT 'Term: ' || c.term || E'\\nDefinition: ' || c.definition AS content,
            c.term,
            c.definition,
            s.title AS set_title,
            s.id    AS set_id,
            ts_rank(to_tsvector('english', c.term || ' ' || c.definition), q.tsq)
              + 0.5 * ts_rank(to_tsvector('english', c.term), q.tsq) AS score,
            ${IMAGES_JSON}
     FROM cards c
     JOIN sets s ON s.id = c.set_id
     CROSS JOIN to_tsquery('english', $1) AS q(tsq)
     LEFT JOIN card_images ci ON ci.card_id = c.id
     WHERE to_tsvector('english', c.term || ' ' || c.definition) @@ q.tsq
     GROUP BY c.id, c.term, c.definition, s.title, s.id, q.tsq
     ORDER BY score DESC
     LIMIT $2`,
    [tsquery, k],
  );
}

/** How the context for an answer was found. */
export type RetrievalMode = "vector" | "keyword" | "none";

export interface RetrievalResult {
  chunks: RetrievedChunk[];
  mode: RetrievalMode;
}

/**
 * Best-effort retrieval: semantic search, falling back to keyword search if
 * embeddings fail, falling back to no context at all.
 *
 * Never throws. Retrieval is an enhancement to an answer, not a prerequisite
 * for one — a failure here must never cost Serena her answer, so the caller
 * gets a `mode` to report instead of an exception.
 */
export async function retrieveWithFallback(
  questionText: string,
  k = 8,
): Promise<RetrievalResult> {
  try {
    return { chunks: await retrieve(questionText, k), mode: "vector" };
  } catch (err) {
    console.error("Vector retrieval failed, trying keyword search:", err);
  }
  try {
    const chunks = await retrieveByKeyword(questionText, k);
    if (chunks.length > 0) return { chunks, mode: "keyword" };
    console.warn("Keyword search matched no cards; answering without context.");
  } catch (err) {
    console.error("Keyword retrieval failed too:", err);
  }
  return { chunks: [], mode: "none" };
}

export function buildContext(chunks: RetrievedChunk[]): string {
  if (chunks.length === 0) return "(No matching flashcards were found.)";
  // Images are numbered globally across all cards, in retrieval rank order, so
  // the number in "[Image on Card N: ...]" matches both the [[image:N]] marker
  // the model emits and the Nth entry from retrievedImages().
  let imageN = 0;
  return chunks
    .map((ch, i) => {
      const lines = [
        `[Card ${i + 1}] (from set: ${ch.set_title})`,
        ch.term,
        ch.definition,
      ];
      for (const img of ch.images ?? []) {
        imageN += 1;
        lines.push(`[Image on Card ${imageN}: ${img.caption}]`);
      }
      return lines.filter((l) => l !== "").join("\n");
    })
    .join("\n\n");
}

/**
 * Every image on a retrieved card, in the same global rank order used by
 * buildContext — so entry index N-1 is the image the model refers to as
 * [[image:N]]. Returned regardless of score: if an image is on a card that
 * matched, Serena sees it.
 */
export function retrievedImages(chunks: RetrievedChunk[]): AnswerImage[] {
  const out: AnswerImage[] = [];
  let n = 0;
  for (const ch of chunks) {
    for (const img of ch.images ?? []) {
      n += 1;
      out.push({
        n,
        id: img.id,
        caption: img.caption,
        term: ch.term,
        setTitle: ch.set_title,
      });
    }
  }
  return out;
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
