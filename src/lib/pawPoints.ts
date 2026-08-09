// Paw points — the arcade's currency. Points are earned by playing games and
// spent in the Shop on real-life rewards.
//
// The wallet is SERVER-AUTHORITATIVE (see src/lib/wallet.ts). This module is
// just a thin client: it asks the server for the balance and to earn/redeem,
// and keeps a localStorage copy purely so the UI can paint instantly on load.
// Editing that cache — or anything client-side — does nothing to the real
// total, because the server never trusts a balance the client sends.

import { REWARDS, type Reward } from "@/lib/rewards";

export type { Reward };
export { REWARDS };

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
}

const CACHE_KEY = "squishygpt.wallet.v1";

export const EMPTY_WALLET: Wallet = { balance: 0, lifetime: 0, claims: [] };

function normalize(w: Partial<Wallet> | null | undefined): Wallet {
  if (!w) return { ...EMPTY_WALLET };
  return {
    balance: Math.max(0, Math.floor(w.balance ?? 0)),
    lifetime: Math.max(0, Math.floor(w.lifetime ?? 0)),
    claims: Array.isArray(w.claims) ? w.claims : [],
  };
}

/** Last-known wallet from the local cache — for instant paint only. */
export function readCachedWallet(): Wallet {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? normalize(JSON.parse(raw) as Partial<Wallet>) : { ...EMPTY_WALLET };
  } catch {
    return { ...EMPTY_WALLET };
  }
}

function cache(w: Wallet): Wallet {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(w));
  } catch {
    /* best-effort */
  }
  return w;
}

/** Fetch the authoritative wallet from the server. */
export async function fetchWallet(): Promise<Wallet> {
  try {
    const res = await fetch("/api/wallet");
    if (!res.ok) return readCachedWallet();
    const data = (await res.json()) as { wallet: Wallet };
    return cache(normalize(data.wallet));
  } catch {
    return readCachedWallet();
  }
}

/**
 * Start a single-use game session before a run. The returned id must be handed
 * back to earnPoints so the server can tie the payout to a game actually opened.
 */
export async function startGameSession(
  gameId: string,
): Promise<string | null> {
  try {
    const res = await fetch("/api/wallet/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gameId }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { sessionId: string };
    return data.sessionId ?? null;
  } catch {
    return null;
  }
}

export interface EarnResult {
  wallet: Wallet;
  awarded: number;
}

/**
 * Report a finished run. The server decides the actual payout (per-run cap,
 * daily cap, single-use session) and returns the authoritative wallet plus the
 * points actually awarded.
 */
export async function earnPoints(
  gameId: string,
  sessionId: string,
  score: number,
): Promise<EarnResult> {
  try {
    const res = await fetch("/api/wallet/earn", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gameId, sessionId, score }),
    });
    if (!res.ok) return { wallet: readCachedWallet(), awarded: 0 };
    const data = (await res.json()) as EarnResult;
    return { wallet: cache(normalize(data.wallet)), awarded: data.awarded ?? 0 };
  } catch {
    return { wallet: readCachedWallet(), awarded: 0 };
  }
}

/** Redeem a reward by id. Returns the updated wallet, or null if it failed. */
export async function redeem(rewardId: string): Promise<Wallet | null> {
  try {
    const res = await fetch("/api/wallet/redeem", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rewardId }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { wallet: Wallet };
    return cache(normalize(data.wallet));
  } catch {
    return null;
  }
}

/** Mark a claimed voucher as used (honored in real life). */
export async function markClaimUsed(claimId: string): Promise<Wallet> {
  try {
    const res = await fetch("/api/wallet/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ claimId }),
    });
    if (!res.ok) return readCachedWallet();
    const data = (await res.json()) as { wallet: Wallet };
    return cache(normalize(data.wallet));
  } catch {
    return readCachedWallet();
  }
}
