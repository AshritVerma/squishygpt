// Client-side "year in review" stats for the birthday letter + recap card.
// Everything is computed from what's already on the device (localStorage),
// so it works instantly and offline; the wallet is fetched separately.

import { questionCount } from "@/lib/milestones";

const CONVOS_KEY = "squishygpt.conversations.v1";

interface StoredMsg {
  role: "user" | "assistant";
  content: string;
}
interface StoredConvo {
  updatedAt: number;
  messages: StoredMsg[];
}

const ARCADE_GAMES: { id: string; title: string }[] = [
  { id: "runner", title: "Cleia Runner" },
  { id: "catch", title: "Treat Catch" },
  { id: "flappy", title: "Cleia Flappy" },
  { id: "focus", title: "Focus Ring" },
  { id: "zoomies", title: "Zoomies" },
  { id: "memory", title: "Memory Match" },
];

const WEEKDAYS = [
  "Sundays",
  "Mondays",
  "Tuesdays",
  "Wednesdays",
  "Thursdays",
  "Fridays",
  "Saturdays",
];

// Filler words to skip when mining her questions for topics. Includes chatty
// framing words so the leftovers are the actual optometry terms.
const STOPWORDS = new Set([
  "the", "and", "for", "with", "this", "that", "what", "when", "does",
  "how", "why", "are", "is", "of", "in", "to", "a", "i", "you", "my",
  "me", "it", "between", "difference", "explain", "tell", "about", "can",
  "do", "vs", "versus", "signs", "symptoms", "what's", "whats", "from",
  "would", "should", "which", "there", "have", "has", "was", "were",
  "some", "most", "more", "cause", "causes", "caused", "will", "get",
]);

export interface YearStats {
  questions: number;
  conversations: number;
  busiestDay: string | null;
  topTopics: string[];
  bestGame: { title: string; score: number } | null;
}

function readConvos(): StoredConvo[] {
  try {
    const raw = localStorage.getItem(CONVOS_KEY);
    return raw ? (JSON.parse(raw) as StoredConvo[]) : [];
  } catch {
    return [];
  }
}

export function computeYearStats(): YearStats {
  const convos = readConvos();

  // Busiest study day: mode of the day-of-week across saved conversations.
  const dayCounts = new Array<number>(7).fill(0);
  for (const c of convos) {
    if (c.updatedAt) dayCounts[new Date(c.updatedAt).getDay()] += 1;
  }
  const maxDay = Math.max(...dayCounts);
  const busiestDay =
    maxDay > 0 ? WEEKDAYS[dayCounts.indexOf(maxDay)] : null;

  // Top topics: frequency of meaningful words across her questions.
  const freq = new Map<string, number>();
  for (const c of convos) {
    for (const m of c.messages) {
      if (m.role !== "user") continue;
      for (const raw of m.content.toLowerCase().split(/[^a-z']+/)) {
        if (raw.length < 4 || STOPWORDS.has(raw)) continue;
        freq.set(raw, (freq.get(raw) ?? 0) + 1);
      }
    }
  }
  const topTopics = [...freq.entries()]
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([w]) => w);

  // Proudest arcade moment: her single highest score.
  let bestGame: YearStats["bestGame"] = null;
  for (const g of ARCADE_GAMES) {
    let score = 0;
    try {
      score = parseInt(localStorage.getItem(`squishygpt.arcade.${g.id}`) || "0", 10) || 0;
    } catch {
      /* ignore */
    }
    if (score > 0 && (!bestGame || score > bestGame.score)) {
      bestGame = { title: g.title, score };
    }
  }

  return {
    questions: questionCount(),
    conversations: convos.length,
    busiestDay,
    topTopics,
    bestGame,
  };
}
