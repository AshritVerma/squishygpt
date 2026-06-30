import "dotenv/config";
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { closePool } from "../src/lib/db";
import { parseQuizletText } from "../src/lib/quizlet";
import { ingestSet } from "../src/lib/sets";

// Usage:
//   npm run ingest -- --title "Ocular Disease" data/ocular-disease.txt
//   npm run ingest -- data/ocular-disease.txt           (title from filename)
//   npm run ingest -- --url "https://quizlet.com/..." --title "X" file.txt

function parseArgs(argv: string[]) {
  let title: string | undefined;
  let url: string | undefined;
  const files: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--title") title = argv[++i];
    else if (a === "--url") url = argv[++i];
    else files.push(a);
  }
  return { title, url, files };
}

async function main() {
  const { title, url, files } = parseArgs(process.argv.slice(2));
  if (files.length === 0) {
    console.error(
      'Usage: npm run ingest -- --title "Set Name" path/to/export.txt',
    );
    process.exit(1);
  }

  for (const file of files) {
    const raw = readFileSync(file, "utf8");
    const cards = parseQuizletText(raw);
    const setTitle =
      title || basename(file).replace(/\.[^.]+$/, "").replace(/[-_]/g, " ");
    if (cards.length === 0) {
      console.warn(`! No cards parsed from ${file}; skipping.`);
      continue;
    }
    console.log(`Ingesting "${setTitle}" (${cards.length} cards) ...`);
    const result = await ingestSet(setTitle, cards, url);
    console.log(
      `✓ Set #${result.setId} "${result.title}" with ${result.cardCount} cards embedded.`,
    );
  }

  await closePool();
}

main().catch((err) => {
  console.error("Ingest failed:", err);
  process.exit(1);
});
