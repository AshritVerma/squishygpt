import { query, toVector } from "./db";
import { embedBatch } from "./embeddings";
import { Card, cardToContent } from "./quizlet";

export interface IngestResult {
  setId: number;
  title: string;
  cardCount: number;
}

/**
 * Create a set, store its cards, embed each card, and store the vectors.
 * Shared by the CLI ingest script and the /api/ingest admin endpoint.
 */
export async function ingestSet(
  title: string,
  cards: Card[],
  sourceUrl?: string,
): Promise<IngestResult> {
  if (cards.length === 0) {
    throw new Error("No cards to ingest");
  }

  const [set] = await query<{ id: number }>(
    "INSERT INTO sets (title, source_url) VALUES ($1, $2) RETURNING id",
    [title, sourceUrl ?? null],
  );
  const setId = set.id;

  // Insert cards and collect their ids in order.
  const cardIds: number[] = [];
  for (const card of cards) {
    const [row] = await query<{ id: number }>(
      "INSERT INTO cards (set_id, term, definition) VALUES ($1, $2, $3) RETURNING id",
      [setId, card.term, card.definition],
    );
    cardIds.push(row.id);
  }

  // Embed in batches to stay within request limits.
  const contents = cards.map(cardToContent);
  const BATCH = 96;
  for (let i = 0; i < contents.length; i += BATCH) {
    const slice = contents.slice(i, i + BATCH);
    const vectors = await embedBatch(slice);
    for (let j = 0; j < slice.length; j++) {
      await query(
        "INSERT INTO chunks (card_id, set_id, content, embedding) VALUES ($1, $2, $3, $4::vector)",
        [cardIds[i + j], setId, slice[j], toVector(vectors[j])],
      );
    }
  }

  return { setId, title, cardCount: cards.length };
}

export interface SetSummary {
  id: number;
  title: string;
  source_url: string | null;
  card_count: number;
  created_at: string;
}

export async function listSets(): Promise<SetSummary[]> {
  return query<SetSummary>(
    `SELECT s.id, s.title, s.source_url, s.created_at,
            COUNT(c.id)::int AS card_count
     FROM sets s
     LEFT JOIN cards c ON c.set_id = s.id
     GROUP BY s.id
     ORDER BY s.created_at DESC`,
  );
}

export async function deleteSet(id: number): Promise<void> {
  await query("DELETE FROM sets WHERE id = $1", [id]);
}

export interface SetCard {
  id: number;
  term: string;
  definition: string;
}

export interface SetDetail {
  id: number;
  title: string;
  source_url: string | null;
  created_at: string;
  cards: SetCard[];
}

/** A random sample of card terms across all sets, for seeding suggestions. */
export async function sampleTerms(
  limit = 40,
): Promise<{ term: string; set_title: string }[]> {
  return query<{ term: string; set_title: string }>(
    `SELECT c.term, s.title AS set_title
     FROM cards c
     JOIN sets s ON s.id = c.set_id
     ORDER BY random()
     LIMIT $1`,
    [limit],
  );
}

export async function getSet(id: number): Promise<SetDetail | null> {
  const [set] = await query<{
    id: number;
    title: string;
    source_url: string | null;
    created_at: string;
  }>("SELECT id, title, source_url, created_at FROM sets WHERE id = $1", [id]);
  if (!set) return null;
  const cards = await query<SetCard>(
    "SELECT id, term, definition FROM cards WHERE set_id = $1 ORDER BY id",
    [id],
  );
  return { ...set, cards };
}
