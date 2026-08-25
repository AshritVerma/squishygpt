// Serena's birthday: August 25. Shared, dependency-free date logic used by
// both the client (UI party mode) and the server (gift + shop gating).

export const BIRTHDAY_MONTH = 7; // August (0-indexed)
export const BIRTHDAY_DAY = 25;

// Local demo switch: set NEXT_PUBLIC_BIRTHDAY_DEMO=1 in .env.local to make
// the whole app (client AND server) act like it's Aug 25. Inert in prod,
// where the var is never set.
const DEMO = process.env.NEXT_PUBLIC_BIRTHDAY_DEMO === "1";

export function isBirthdayDate(d: Date): boolean {
  if (DEMO) return true;
  return d.getMonth() === BIRTHDAY_MONTH && d.getDate() === BIRTHDAY_DAY;
}

/**
 * Server-side check, pinned to Serena's timezone (America/New_York) so a UTC
 * server doesn't start/end her birthday at 8pm the day before.
 */
export function isBirthdayInNY(now = new Date()): boolean {
  if (DEMO) return true;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "numeric",
    day: "numeric",
  }).formatToParts(now);
  const month = Number(parts.find((p) => p.type === "month")?.value);
  const day = Number(parts.find((p) => p.type === "day")?.value);
  return month === BIRTHDAY_MONTH + 1 && day === BIRTHDAY_DAY;
}

/** Serena was born Aug 25, 2000 — turning 26 in 2026, and so on. */
export const SERENA_BIRTH_YEAR = 2000;

/** Her age on the birthday itself (NY time). */
export function serenaAge(now = new Date()): number {
  return birthdayYearInNY(now) - SERENA_BIRTH_YEAR;
}

/** The year of the birthday in NY time — tags the once-a-year gift. */
export function birthdayYearInNY(now = new Date()): number {
  return Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      year: "numeric",
    }).format(now),
  );
}

/**
 * Client-side check: the real date, or the ?cleia=birthday preview param so
 * everything can be QA'd before the 25th. Browser only.
 */
export function birthdayActive(): boolean {
  if (typeof window === "undefined") return false;
  if (
    new URLSearchParams(window.location.search).get("cleia") === "birthday"
  ) {
    return true;
  }
  return isBirthdayDate(new Date());
}
