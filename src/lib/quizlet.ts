// Parses Quizlet-style exports into term/definition pairs.
//
// Quizlet's "Export" feature lets you choose a delimiter between term and
// definition (default: Tab) and between cards (default: newline). This parser
// auto-detects the common formats so Serena can paste whatever Quizlet gives:
//   - Tab between term/definition, newline between cards (Quizlet default)
//   - " - " or " : " between term/definition
//   - A custom row separator like "\n\n" between cards
//
// You can also override the delimiters explicitly.

export interface Card {
  term: string;
  definition: string;
}

export interface ParseOptions {
  termDelimiter?: string; // between term and definition
  cardDelimiter?: string; // between cards
}

function splitCards(raw: string, cardDelimiter?: string): string[] {
  if (cardDelimiter) return raw.split(cardDelimiter);
  // Prefer blank-line separated rows when present, otherwise single newlines.
  if (/\n\s*\n/.test(raw)) return raw.split(/\n\s*\n/);
  return raw.split(/\r?\n/);
}

function splitTermDef(
  row: string,
  termDelimiter?: string,
): [string, string] | null {
  if (termDelimiter) {
    const idx = row.indexOf(termDelimiter);
    if (idx === -1) return null;
    return [row.slice(0, idx), row.slice(idx + termDelimiter.length)];
  }
  // Auto-detect: tab first (Quizlet default), then common separators.
  for (const delim of ["\t", " — ", " - ", " – ", " : ", ": ", "|"]) {
    const idx = row.indexOf(delim);
    if (idx > 0) {
      return [row.slice(0, idx), row.slice(idx + delim.length)];
    }
  }
  return null;
}

export function parseQuizletText(
  raw: string,
  options: ParseOptions = {},
): Card[] {
  const cards: Card[] = [];
  const rows = splitCards(raw.trim(), options.cardDelimiter);

  for (const row of rows) {
    const trimmed = row.trim();
    if (!trimmed) continue;
    const pair = splitTermDef(trimmed, options.termDelimiter);
    if (!pair) continue;
    const term = pair[0].trim();
    const definition = pair[1].trim();
    if (!term || !definition) continue;
    cards.push({ term, definition });
  }

  return cards;
}

/** Text we embed and store for each card. */
export function cardToContent(card: Card): string {
  return `Term: ${card.term}\nDefinition: ${card.definition}`;
}
