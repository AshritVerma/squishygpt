import { config } from "dotenv";
config({ path: ".env.local" });
config();
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { closePool, query } from "../src/lib/db";
import { ingestSet } from "../src/lib/sets";
import type { Card } from "../src/lib/quizlet";

// Usage:
//   npm run ingest:json                          (reads data/quizlet-export.json)
//   npm run ingest:json -- path/to/export.json
//   npm run ingest:json -- --force               (re-ingest even if source_url exists)
//
// Input file shape (produced by scripts/quizlet-export.js):
//   [{ "title": "Ocular Disease", "url": "https://quizlet.com/...", "cards": [{ "term": "...", "definition": "..." }, ...] }, ...]

interface ExportedSet {
  title: string;
  url?: string | null;
  cards: Card[];
}

function parseArgs(argv: string[]) {
  let force = false;
  let file: string | undefined;
  for (const a of argv) {
    if (a === "--force") force = true;
    else if (!file) file = a;
  }
  return { force, file: file ?? "data/quizlet-export.json" };
}

async function alreadyIngested(sourceUrl: string): Promise<boolean> {
  const rows = await query<{ id: number }>(
    "SELECT id FROM sets WHERE source_url = $1 LIMIT 1",
    [sourceUrl],
  );
  return rows.length > 0;
}

async function main() {
  const { force, file } = parseArgs(process.argv.slice(2));
  const path = resolve(process.cwd(), file);

  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (err) {
    console.error(`Could not read ${path}:`, (err as Error).message);
    console.error(
      "Run scripts/quizlet-export.js in your browser first, then move the downloaded quizlet-export.json into data/.",
    );
    process.exit(1);
  }

  let sets: ExportedSet[];
  try {
    sets = JSON.parse(raw);
  } catch (err) {
    console.error(`Invalid JSON in ${path}:`, (err as Error).message);
    process.exit(1);
  }

  if (!Array.isArray(sets)) {
    console.error("Expected a JSON array of sets at the top level.");
    process.exit(1);
  }

  console.log(`Loaded ${sets.length} sets from ${file}.`);

  let imported = 0;
  let skipped = 0;
  let failed = 0;
  let totalCards = 0;

  for (let i = 0; i < sets.length; i++) {
    const set = sets[i];
    const tag = `[${i + 1}/${sets.length}]`;
    const title = set.title?.trim();
    const url = set.url?.trim() || undefined;
    const cards = Array.isArray(set.cards) ? set.cards : [];

    if (!title) {
      console.warn(`${tag} ! missing title; skipping`);
      failed++;
      continue;
    }
    if (cards.length === 0) {
      console.warn(`${tag} ! "${title}" has no cards; skipping`);
      failed++;
      continue;
    }

    if (!force && url && (await alreadyIngested(url))) {
      console.log(`${tag} = "${title}" already ingested (source_url match); skip`);
      skipped++;
      continue;
    }

    try {
      const result = await ingestSet(title, cards, url);
      totalCards += result.cardCount;
      imported++;
      console.log(
        `${tag} ✓ #${result.setId} "${result.title}" — ${result.cardCount} cards`,
      );
    } catch (err) {
      failed++;
      console.error(`${tag} ✗ "${title}" —`, (err as Error).message);
    }
  }

  console.log(
    `\nDone. imported=${imported} skipped=${skipped} failed=${failed} cards=${totalCards}`,
  );

  await closePool();
}

main().catch(async (err) => {
  console.error("Ingest failed:", err);
  await closePool().catch(() => {});
  process.exit(1);
});
