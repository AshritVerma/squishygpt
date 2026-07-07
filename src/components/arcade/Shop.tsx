"use client";

import { useState } from "react";
import {
  REWARDS,
  redeem,
  markClaimUsed,
  type Reward,
  type Wallet,
} from "@/lib/pawPoints";

// The Paw Shop — spend points earned in the arcade on real-life rewards,
// honored by Ashrit. Redeeming creates a voucher in "Claimed"; tap "mark done"
// once it's been honored.
export function Shop({
  wallet,
  onWalletChange,
}: {
  wallet: Wallet;
  onWalletChange: (w: Wallet) => void;
}) {
  const [confirming, setConfirming] = useState<Reward | null>(null);
  const [justClaimed, setJustClaimed] = useState<string | null>(null);

  const buy = (reward: Reward) => {
    const next = redeem(reward);
    setConfirming(null);
    if (!next) return;
    onWalletChange(next);
    setJustClaimed(reward.id);
    window.setTimeout(() => setJustClaimed(null), 2500);
    navigator.vibrate?.(20);
    window.dispatchEvent(new Event("squishy:confetti"));
  };

  const pending = wallet.claims.filter((c) => !c.used);
  const used = wallet.claims.filter((c) => c.used);

  return (
    <div className="scroll-area flex flex-1 flex-col gap-4 overflow-y-auto p-4">
      {/* Balance */}
      <div className="glass squish-shadow flex items-center justify-between rounded-2xl px-4 py-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
            Paw points
          </p>
          <p className="text-2xl font-extrabold">
            <span className="accent-text">{wallet.balance}</span>{" "}
            <span className="text-sm font-semibold text-[var(--muted)]">🐾</span>
          </p>
        </div>
        <p className="text-right text-[11px] leading-tight text-[var(--muted)]">
          {wallet.lifetime} earned
          <br />
          all-time
        </p>
      </div>

      <p className="text-center text-xs text-[var(--muted)]">
        Play games to earn points, redeem them for the real thing. 💝
      </p>

      {/* Catalog */}
      <div className="flex flex-col gap-2">
        {REWARDS.map((r) => {
          const affordable = wallet.balance >= r.cost;
          const isConfirming = confirming?.id === r.id;
          return (
            <div
              key={r.id}
              className={`glass squish-shadow rounded-2xl px-4 py-3 transition ${
                justClaimed === r.id ? "ring-2 ring-[var(--ring)]" : ""
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">{r.emoji}</span>
                <div className="min-w-0 flex-1">
                  <p className="font-bold leading-tight">{r.title}</p>
                  <p className="text-xs text-[var(--muted)]">{r.blurb}</p>
                </div>
                {isConfirming ? (
                  <div className="flex shrink-0 flex-col gap-1">
                    <button
                      onClick={() => buy(r)}
                      className="accent-gradient spring rounded-full px-3 py-1.5 text-xs font-semibold text-white"
                    >
                      Confirm
                    </button>
                    <button
                      onClick={() => setConfirming(null)}
                      className="rounded-full px-3 py-1 text-[11px] text-[var(--muted)]"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => affordable && setConfirming(r)}
                    disabled={!affordable}
                    className={`spring shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                      affordable
                        ? "accent-gradient text-white"
                        : "bg-[var(--accent)]/10 text-[var(--muted)] opacity-60"
                    }`}
                  >
                    {r.cost} 🐾
                  </button>
                )}
              </div>
              {justClaimed === r.id && (
                <p className="mt-2 text-center text-xs font-semibold text-[var(--accent)]">
                  Claimed!! Show Ashrit this screen 🎉
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* Claimed vouchers */}
      {wallet.claims.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-bold">
            Claimed{" "}
            <span className="text-xs font-normal text-[var(--muted)]">
              ({pending.length} to redeem)
            </span>
          </h3>
          <div className="flex flex-col gap-2">
            {pending.map((c) => (
              <div
                key={c.id}
                className="flex items-center gap-3 rounded-2xl border border-dashed border-[var(--accent)]/40 bg-[var(--accent)]/[0.05] px-4 py-2.5"
              >
                <span className="text-xl">{c.emoji}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold leading-tight">
                    {c.title}
                  </p>
                  <p className="text-[11px] text-[var(--muted)]">
                    {new Date(c.at).toLocaleDateString()} · {c.cost} 🐾
                  </p>
                </div>
                <button
                  onClick={() => onWalletChange(markClaimUsed(c.id))}
                  className="spring shrink-0 rounded-full px-3 py-1.5 text-xs font-medium text-[var(--muted)] transition hover:bg-emerald-500/10 hover:text-emerald-500"
                >
                  Mark done
                </button>
              </div>
            ))}
            {used.map((c) => (
              <div
                key={c.id}
                className="flex items-center gap-3 rounded-2xl px-4 py-2 opacity-45"
              >
                <span className="text-lg">{c.emoji}</span>
                <p className="min-w-0 flex-1 truncate text-sm line-through">
                  {c.title}
                </p>
                <span className="text-[11px] text-[var(--muted)]">
                  {new Date(c.at).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
