// Reward catalog + earn limits — shared by the client (to render the shop) and
// the server (as the source of truth for costs and anti-cheat caps). This file
// is pure data with no browser or Node dependencies so it's safe to import on
// both sides. The client only ever sends a rewardId; the server looks up the
// cost here, so a tampered client can't invent a cheaper price.

export interface Reward {
  id: string;
  title: string;
  blurb: string;
  emoji: string;
  cost: number;
}

// Real-life rewards, honored by Ashrit.
export const REWARDS: Reward[] = [
  {
    id: "cuddle",
    title: "Cleia cuddle hour",
    blurb: "One uninterrupted hour of Cleia snuggles, guaranteed.",
    emoji: "🐶",
    cost: 100,
  },
  {
    id: "boba",
    title: "Boba on demand",
    blurb: "Your drink of choice, delivered to your study spot.",
    emoji: "🧋",
    cost: 150,
  },
  {
    id: "movie",
    title: "Movie night, your pick",
    blurb: "No veto rights. Yes, even the rom-com.",
    emoji: "🍿",
    cost: 250,
  },
  {
    id: "dishes",
    title: "Get out of dishes free",
    blurb: "One full day, zero dishes. Redeemable any time.",
    emoji: "🍽️",
    cost: 300,
  },
  {
    id: "breakfast",
    title: "Breakfast in bed",
    blurb: "Cooked and delivered before your first patient.",
    emoji: "🥞",
    cost: 400,
  },
  {
    id: "massage",
    title: "One-hour massage",
    blurb: "Full hour, no phone, no complaints.",
    emoji: "💆‍♀️",
    cost: 600,
  },
  {
    id: "date",
    title: "Fancy date night",
    blurb: "You choose the place. Ashrit handles everything else.",
    emoji: "🥂",
    cost: 800,
  },
];

export function rewardById(id: string): Reward | undefined {
  return REWARDS.find((r) => r.id === id);
}

// ---- Anti-cheat limits ----
// Scores come from client-side canvas games, so they can't be perfectly
// verified. These caps bound how much a single run or a single day can pay out,
// which turns "set my balance to a million" into "actually grind, slowly" —
// enough for a private two-person gift app.

// Max paw points a single run of each game may pay out. Set comfortably above
// a great legit run so real play is never clipped, but far below absurd values.
export const EARN_CAPS: Record<string, number> = {
  runner: 1200,
  catch: 800,
  flappy: 1000,
  focus: 600,
  zoomies: 800,
  memory: 200,
};

// Fallback cap for any game id not listed above.
export const DEFAULT_EARN_CAP = 800;

// Max paw points that can be earned across all games in any rolling 24h window.
export const DAILY_EARN_CAP = 3000;

export function earnCap(gameId: string): number {
  return EARN_CAPS[gameId] ?? DEFAULT_EARN_CAP;
}
