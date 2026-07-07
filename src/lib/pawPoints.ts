// Paw points — the arcade's currency. Every game run earns points based on
// its score; points are spent in the Shop on real-life rewards. The wallet
// lives in localStorage and syncs to the server (last-write-wins by
// updatedAt) so the balance follows Serena across devices.

import { fetchClientState, pushClientState } from "@/lib/clientState";

export interface Claim {
  id: string;
  rewardId: string;
  title: string;
  emoji: string;
  cost: number;
  at: number; // epoch ms when redeemed
  used: boolean;
}

export interface Wallet {
  balance: number;
  lifetime: number; // total ever earned (never decreases)
  claims: Claim[];
  updatedAt: number;
}

const KEY = "squishygpt.wallet.v1";
const STATE_KEY = "wallet";

export const EMPTY_WALLET: Wallet = {
  balance: 0,
  lifetime: 0,
  claims: [],
  updatedAt: 0,
};

export function readWallet(): Wallet {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...EMPTY_WALLET };
    const w = JSON.parse(raw) as Partial<Wallet>;
    return {
      balance: Math.max(0, w.balance ?? 0),
      lifetime: Math.max(0, w.lifetime ?? 0),
      claims: Array.isArray(w.claims) ? w.claims : [],
      updatedAt: w.updatedAt ?? 0,
    };
  } catch {
    return { ...EMPTY_WALLET };
  }
}

function writeWallet(w: Wallet): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(w));
  } catch {
    /* best-effort */
  }
  pushClientState(STATE_KEY, w);
}

// Merge local and server copies: the fresher one (updatedAt) wins.
export async function syncWallet(): Promise<Wallet> {
  const local = readWallet();
  const remote = await fetchClientState<Wallet>(STATE_KEY);
  if (!remote || (remote.updatedAt ?? 0) <= local.updatedAt) {
    if (local.updatedAt > (remote?.updatedAt ?? 0)) {
      pushClientState(STATE_KEY, local);
    }
    return local;
  }
  try {
    localStorage.setItem(KEY, JSON.stringify(remote));
  } catch {
    /* best-effort */
  }
  return remote;
}

/** Add points from a finished game run. Returns the updated wallet. */
export function earnPoints(points: number): Wallet {
  const w = readWallet();
  if (points <= 0) return w;
  const next: Wallet = {
    ...w,
    balance: w.balance + points,
    lifetime: w.lifetime + points,
    updatedAt: Date.now(),
  };
  writeWallet(next);
  return next;
}

/** Redeem a reward. Returns the updated wallet, or null if unaffordable. */
export function redeem(reward: {
  id: string;
  title: string;
  emoji: string;
  cost: number;
}): Wallet | null {
  const w = readWallet();
  if (w.balance < reward.cost) return null;
  const claim: Claim = {
    id: Math.random().toString(36).slice(2),
    rewardId: reward.id,
    title: reward.title,
    emoji: reward.emoji,
    cost: reward.cost,
    at: Date.now(),
    used: false,
  };
  const next: Wallet = {
    ...w,
    balance: w.balance - reward.cost,
    claims: [claim, ...w.claims],
    updatedAt: Date.now(),
  };
  writeWallet(next);
  return next;
}

/** Mark a claimed voucher as used (honored in real life). */
export function markClaimUsed(claimId: string): Wallet {
  const w = readWallet();
  const next: Wallet = {
    ...w,
    claims: w.claims.map((c) => (c.id === claimId ? { ...c, used: true } : c)),
    updatedAt: Date.now(),
  };
  writeWallet(next);
  return next;
}

// ---- Reward catalog (real-life rewards, honored by Ashrit) ----

export interface Reward {
  id: string;
  title: string;
  blurb: string;
  emoji: string;
  cost: number;
}

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
