import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export const runtime = "nodejs";

const MAX_COUNT = 24;
const CHOICES = 4;

// Terms that read well as a multiple-choice answer: short, and not a question
// or a dangling "Label:".
const TERM_OK = `length(trim(%s)) BETWEEN 2 AND 48 AND trim(%s) !~ '[?:]$'`;
const termOk = (col: string) => TERM_OK.replaceAll("%s", col);

export interface ImageCardDto {
  imageId: number;
  term: string;
  setTitle: string;
  /** CHOICES terms, shuffled, one of which is `term`. */
  choices: string[];
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

// Two terms are "the same answer" if one normalized form contains the other
// ("Vernal keratoconjunctivitis" vs "Vernal keratoconjunctivitis (Spring)").
const overlaps = (a: string, b: string) => {
  const x = norm(a);
  const y = norm(b);
  return !x || !y || x.includes(y) || y.includes(x);
};

function shuffle<T>(xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Random image cards for the arcade's study games. Each comes with
 * multiple-choice options; distractors are drawn from the same study set so
 * they're plausible, topped up from anywhere if the set is small.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const count = Math.min(
    MAX_COUNT,
    Math.max(1, Number(url.searchParams.get("count")) || 10),
  );

  const rows = await query<{
    image_id: number;
    term: string;
    set_title: string;
    candidates: string[];
  }>(
    `WITH picks AS (
       SELECT ci.id AS image_id, trim(c.term) AS term, c.set_id, s.title AS set_title
         FROM card_images ci
         JOIN cards c ON c.id = ci.card_id
         JOIN sets s ON s.id = c.set_id
        WHERE ${termOk("c.term")}
          AND coalesce(ci.caption, '') !~* '^text[- ](only|based)'
        ORDER BY random()
        LIMIT $1
     )
     SELECT p.image_id, p.term, p.set_title,
            ARRAY(
              SELECT t FROM (
                SELECT DISTINCT trim(c2.term) AS t
                  FROM cards c2
                 WHERE c2.set_id = p.set_id AND ${termOk("c2.term")}
              ) d
              ORDER BY random()
              LIMIT 12
            ) AS candidates
       FROM picks p`,
    [count * 2],
  );

  let fallback: string[] | null = null;
  const loadFallback = async () => {
    fallback ??= (
      await query<{ t: string }>(
        `SELECT t FROM (
           SELECT DISTINCT trim(term) AS t FROM cards WHERE ${termOk("term")}
         ) d ORDER BY random() LIMIT 60`,
      )
    ).map((r) => r.t);
    return fallback;
  };

  const cards: ImageCardDto[] = [];
  const seen: string[] = [];
  for (const row of rows) {
    if (cards.length >= count) break;
    if (seen.some((t) => overlaps(t, row.term))) continue;

    const picked: string[] = [];
    const take = (pool: string[]) => {
      for (const t of pool) {
        if (picked.length >= CHOICES - 1) return;
        if (overlaps(t, row.term) || picked.some((p) => overlaps(p, t))) continue;
        picked.push(t);
      }
    };
    take(row.candidates);
    if (picked.length < CHOICES - 1) take(await loadFallback());
    if (picked.length < CHOICES - 1) continue;

    seen.push(row.term);
    cards.push({
      imageId: row.image_id,
      term: row.term,
      setTitle: row.set_title,
      choices: shuffle([row.term, ...picked]),
    });
  }

  return NextResponse.json(
    { cards },
    { headers: { "Cache-Control": "no-store" } },
  );
}
