// Server-authoritative paw-points wallet. This is the ONLY place the balance is
// computed or changed; the client can read it and request earns/redeems, but it
// can never set a number directly. Everything runs through an append-only
// ledger, so tampering with client-synced JSON has no effect on the real total.
//
// Trust model note: the app has a single shared password, so cryptographically
// distinguishing "the earner" from "the honorer" is impossible. What we can do
// — and do here — is make the server the source of truth and bound how points
// can enter the system (per-run caps, a rolling daily cap, and single-use game
// sessions). That defeats the practical cheats (DevTools/localStorage edits,
// PUTing a huge balance, replaying a payout) and reduces any remaining abuse to
// slow, manual grinding.

import type { PoolClient } from "pg";
import { withTransaction } from "@/lib/db";
import { DAILY_EARN_CAP, earnCap, rewardById } from "@/lib/rewards";

export interface WalletClaim {
  id: string;
  rewardId: string;
  title: string;
  emoji: string;
  cost: number;
  at: number; // epoch ms when redeemed
  used: boolean;
}

export interface WalletState {
  balance: number;
  lifetime: number; // total ever earned (never decreases)
  claims: WalletClaim[];
}

// Serializes all wallet mutations for this single-user app, so concurrent
// requests can't double-spend or race the daily cap.
const WALLET_LOCK_KEY = 74123;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function toInt(value: unknown): number {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) ? n : 0;
}

async function readState(client: PoolClient): Promise<WalletState> {
  const totals = await client.query<{ balance: number; lifetime: number }>(
    `SELECT COALESCE(SUM(amount), 0)::int AS balance,
            COALESCE(SUM(amount) FILTER (WHERE kind = 'earn'), 0)::int AS lifetime
       FROM wallet_ledger`,
  );
  const claims = await client.query(
    `SELECT id, reward_id, title, emoji, cost,
            (EXTRACT(EPOCH FROM created_at) * 1000)::bigint AS at, used
       FROM wallet_claims
      ORDER BY created_at DESC`,
  );
  return {
    balance: totals.rows[0]?.balance ?? 0,
    lifetime: totals.rows[0]?.lifetime ?? 0,
    claims: claims.rows.map((r) => ({
      id: String(r.id),
      rewardId: String(r.reward_id),
      title: String(r.title),
      emoji: String(r.emoji),
      cost: Number(r.cost),
      at: Number(r.at),
      used: Boolean(r.used),
    })),
  };
}

// One-time migration: if the ledger is empty but a legacy client-synced wallet
// exists (from before this was server-authoritative), seed the ledger from it
// so nobody loses their balance. Runs under the wallet lock, guarded by the
// empty-ledger check, so it only ever happens once.
async function ensureSeeded(client: PoolClient): Promise<void> {
  const existing = await client.query<{ n: number }>(
    "SELECT count(*)::int AS n FROM wallet_ledger",
  );
  if ((existing.rows[0]?.n ?? 0) > 0) return;

  const legacy = await client.query<{ value: unknown }>(
    "SELECT value FROM client_state WHERE key = 'wallet'",
  );
  const w = legacy.rows[0]?.value as
    | {
        lifetime?: unknown;
        claims?: Array<Record<string, unknown>>;
      }
    | undefined;
  if (!w) return;

  const lifetime = Math.max(0, toInt(w.lifetime));
  if (lifetime > 0) {
    await client.query(
      "INSERT INTO wallet_ledger (kind, amount, game_id) VALUES ('earn', $1, 'legacy')",
      [lifetime],
    );
  }

  const claims = Array.isArray(w.claims) ? w.claims : [];
  for (const c of claims) {
    const cost = Math.max(0, toInt(c.cost));
    const at = toInt(c.at) || Date.now();
    const used = Boolean(c.used);
    const ledger = await client.query<{ id: number }>(
      `INSERT INTO wallet_ledger (kind, amount, reward_id, created_at)
       VALUES ('redeem', $1, $2, to_timestamp($3 / 1000.0))
       RETURNING id`,
      [-cost, c.rewardId ? String(c.rewardId) : null, at],
    );
    await client.query(
      `INSERT INTO wallet_claims
         (reward_id, title, emoji, cost, ledger_id, used, created_at, used_at)
       VALUES ($1, $2, $3, $4, $5, $6, to_timestamp($7 / 1000.0), $8)`,
      [
        c.rewardId ? String(c.rewardId) : "legacy",
        c.title ? String(c.title) : "Reward",
        c.emoji ? String(c.emoji) : "🎁",
        cost,
        ledger.rows[0]?.id ?? null,
        used,
        at,
        used ? new Date(at) : null,
      ],
    );
  }
}

// Every operation grabs the wallet lock, seeds if needed, then runs `fn`.
async function withWallet<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  return withTransaction(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock($1)", [WALLET_LOCK_KEY]);
    await ensureSeeded(client);
    return fn(client);
  });
}

export async function getWalletState(): Promise<WalletState> {
  return withWallet(readState);
}

/** Issue a fresh single-use session tying a future earn to this game. */
export async function startGameSession(gameId: string): Promise<string> {
  return withTransaction(async (client) => {
    const row = await client.query<{ id: string }>(
      "INSERT INTO game_session (game_id) VALUES ($1) RETURNING id",
      [gameId],
    );
    return row.rows[0].id;
  });
}

export interface EarnResult {
  wallet: WalletState;
  awarded: number;
}

/**
 * Award points for a finished run. Requires a fresh, unconsumed session for the
 * matching game (single-use → no replay). The payout is clamped to the game's
 * per-run cap and to whatever remains of the rolling daily cap.
 */
export async function awardEarn(
  sessionId: string,
  gameId: string,
  score: number,
): Promise<EarnResult> {
  return withWallet(async (client) => {
    const noop = async (): Promise<EarnResult> => ({
      wallet: await readState(client),
      awarded: 0,
    });

    if (!UUID_RE.test(sessionId)) return noop();

    const session = await client.query<{ game_id: string; consumed: boolean }>(
      `SELECT game_id, consumed_at IS NOT NULL AS consumed
         FROM game_session WHERE id = $1 FOR UPDATE`,
      [sessionId],
    );
    const s = session.rows[0];
    if (!s || s.consumed || s.game_id !== gameId) return noop();

    // Consume the session regardless of payout so it can't be reused.
    await client.query(
      "UPDATE game_session SET consumed_at = now() WHERE id = $1",
      [sessionId],
    );

    let awarded = Math.max(0, Math.min(toInt(score), earnCap(gameId)));
    if (awarded > 0) {
      const today = await client.query<{ earned: number }>(
        `SELECT COALESCE(SUM(amount), 0)::int AS earned
           FROM wallet_ledger
          WHERE kind = 'earn' AND created_at > now() - interval '24 hours'`,
      );
      const remaining = Math.max(0, DAILY_EARN_CAP - (today.rows[0]?.earned ?? 0));
      awarded = Math.min(awarded, remaining);
    }

    if (awarded > 0) {
      await client.query(
        `INSERT INTO wallet_ledger (kind, amount, game_id, session_id)
         VALUES ('earn', $1, $2, $3)`,
        [awarded, gameId, sessionId],
      );
    }

    return { wallet: await readState(client), awarded };
  });
}

/**
 * Redeem a reward. Cost comes from the server catalog (not the client), and the
 * balance is checked server-side, so it can't go negative or be under-paid.
 * Returns null if the reward is unknown or unaffordable.
 */
export async function redeemReward(
  rewardId: string,
): Promise<WalletState | null> {
  return withWallet(async (client) => {
    const reward = rewardById(rewardId);
    if (!reward) return null;

    const state = await readState(client);
    if (state.balance < reward.cost) return null;

    const ledger = await client.query<{ id: number }>(
      `INSERT INTO wallet_ledger (kind, amount, reward_id)
       VALUES ('redeem', $1, $2) RETURNING id`,
      [-reward.cost, reward.id],
    );
    await client.query(
      `INSERT INTO wallet_claims (reward_id, title, emoji, cost, ledger_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [reward.id, reward.title, reward.emoji, reward.cost, ledger.rows[0].id],
    );
    return readState(client);
  });
}

/** Mark a claimed voucher as honored in real life. */
export async function markClaimUsed(claimId: string): Promise<WalletState> {
  return withWallet(async (client) => {
    if (UUID_RE.test(claimId)) {
      await client.query(
        "UPDATE wallet_claims SET used = true, used_at = now() WHERE id = $1 AND used = false",
        [claimId],
      );
    }
    return readState(client);
  });
}
