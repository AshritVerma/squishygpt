import { query, toVector } from "./db";
import { embed, embedBatch } from "./embeddings";
import { Card, cardToContent } from "./quizlet";
import { fetchImage, captionImage } from "./cardImages";

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

  // Download, caption, and store any card images. The caption is collected per
  // card so it can be embedded with the card below (making image-only cards
  // searchable). A single image failing never fails the whole set — retrieval
  // is an enhancement, not a prerequisite.
  const captionsByCard = new Map<number, string[]>();
  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];
    const cardId = cardIds[i];
    const sides: Array<["term" | "definition", string | undefined]> = [
      ["term", card.termImage],
      ["definition", card.definitionImage],
    ];
    for (const [side, url] of sides) {
      if (!url) continue;
      try {
        const image = await fetchImage(url);
        const caption = await captionImage(image, card, side);
        await query(
          `INSERT INTO card_images (card_id, side, source_url, mime, bytes, caption)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (card_id, side) DO NOTHING`,
          [cardId, side, url, image.mime, image.bytes, caption],
        );
        const list = captionsByCard.get(cardId) ?? [];
        list.push(caption);
        captionsByCard.set(cardId, list);
      } catch (err) {
        console.warn(
          `Skipping ${side} image for card ${cardId} (${url}):`,
          (err as Error).message,
        );
      }
    }
  }

  // Embed in batches to stay within request limits.
  const contents = cards.map((card, i) =>
    cardToContent(card, captionsByCard.get(cardIds[i]) ?? []),
  );
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

export interface BackfillResult {
  attached: number; // images stored
  newCards: number; // image-only cards that were previously dropped
  reembedded: number; // cards whose chunk was refreshed with captions
}

/**
 * Attach images to a set that was already ingested (text-only), without
 * re-creating the set — so its id, and the source chips in old chats, stay
 * valid. Matches existing cards by (term, definition), inserts the image-only
 * cards that the old exporter dropped, and re-embeds any card whose captions
 * changed so the caption becomes searchable.
 *
 * Idempotent: UNIQUE (card_id, side) means re-running only fills gaps.
 */
export async function backfillSetImages(
  setId: number,
  cards: Card[],
): Promise<BackfillResult> {
  const result: BackfillResult = { attached: 0, newCards: 0, reembedded: 0 };

  // Index existing cards by normalized (term, definition) for matching.
  const existing = await query<{ id: number; term: string; definition: string }>(
    "SELECT id, term, definition FROM cards WHERE set_id = $1",
    [setId],
  );
  const key = (t: string, d: string) => `${t.trim()}\u0000${d.trim()}`;
  const byKey = new Map<string, number>();
  for (const c of existing) byKey.set(key(c.term, c.definition), c.id);

  for (const card of cards) {
    if (!card.termImage && !card.definitionImage) continue;

    let cardId = byKey.get(key(card.term, card.definition));
    // A newly inserted card has no chunk yet, so it must be embedded even if
    // every one of its images fails to download.
    let changed = false;
    if (cardId == null) {
      // Image-only (or otherwise new) card the old exporter dropped.
      const [row] = await query<{ id: number }>(
        "INSERT INTO cards (set_id, term, definition) VALUES ($1, $2, $3) RETURNING id",
        [setId, card.term, card.definition],
      );
      cardId = row.id;
      byKey.set(key(card.term, card.definition), cardId);
      result.newCards++;
      changed = true;
    }

    const sides: Array<["term" | "definition", string | undefined]> = [
      ["term", card.termImage],
      ["definition", card.definitionImage],
    ];
    for (const [side, url] of sides) {
      if (!url) continue;
      // Skip sides that already have a stored image (idempotent re-runs).
      const [present] = await query<{ id: number }>(
        "SELECT id FROM card_images WHERE card_id = $1 AND side = $2",
        [cardId, side],
      );
      if (present) continue;
      try {
        const image = await fetchImage(url);
        const caption = await captionImage(image, card, side);
        await query(
          `INSERT INTO card_images (card_id, side, source_url, mime, bytes, caption)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (card_id, side) DO NOTHING`,
          [cardId, side, url, image.mime, image.bytes, caption],
        );
        result.attached++;
        changed = true;
      } catch (err) {
        console.warn(
          `Skipping ${side} image for card ${cardId} (${url}):`,
          (err as Error).message,
        );
      }
    }

    if (!changed) continue;

    // Re-embed this card with its captions so the image becomes searchable.
    const captions = await query<{ caption: string }>(
      "SELECT caption FROM card_images WHERE card_id = $1 ORDER BY side",
      [cardId],
    );
    const content = cardToContent(
      card,
      captions.map((c) => c.caption),
    );
    const vector = toVector(await embed(content));
    await query("DELETE FROM chunks WHERE card_id = $1", [cardId]);
    await query(
      "INSERT INTO chunks (card_id, set_id, content, embedding) VALUES ($1, $2, $3, $4::vector)",
      [cardId, setId, content, vector],
    );
    result.reembedded++;
  }

  return result;
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

export interface SetCardImage {
  id: number;
  side: "term" | "definition";
  caption: string;
}

export interface SetCard {
  id: number;
  term: string;
  definition: string;
  images: SetCardImage[];
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
    `SELECT c.id, c.term, c.definition,
            COALESCE(
              json_agg(
                json_build_object('id', ci.id, 'side', ci.side, 'caption', ci.caption)
                ORDER BY ci.side
              ) FILTER (WHERE ci.id IS NOT NULL),
              '[]'
            ) AS images
     FROM cards c
     LEFT JOIN card_images ci ON ci.card_id = c.id
     WHERE c.set_id = $1
     GROUP BY c.id
     ORDER BY c.id`,
    [id],
  );
  return { ...set, cards };
}
