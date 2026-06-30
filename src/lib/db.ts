import { Pool } from "pg";

declare global {
  // eslint-disable-next-line no-var
  var __squishyPool: Pool | undefined;
}

function createPool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }

  // Railway/managed Postgres require SSL; local Postgres usually does not.
  const isLocal =
    connectionString.includes("localhost") ||
    connectionString.includes("127.0.0.1");
  const sslDisabled = process.env.PGSSL === "disable";

  return new Pool({
    connectionString,
    ssl: isLocal || sslDisabled ? false : { rejectUnauthorized: false },
    max: 5,
  });
}

// Lazily create a single pool (reused across hot reloads / invocations).
// Lazy so that `next build` never evaluates this with a missing DATABASE_URL.
export function getPool(): Pool {
  if (!global.__squishyPool) {
    global.__squishyPool = createPool();
  }
  return global.__squishyPool;
}

export async function query<T = unknown>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const res = await getPool().query(text, params);
  return res.rows as T[];
}

export async function closePool(): Promise<void> {
  if (global.__squishyPool) {
    await global.__squishyPool.end();
    global.__squishyPool = undefined;
  }
}

/** Format a JS number[] as a pgvector literal: "[0.1,0.2,...]" */
export function toVector(values: number[]): string {
  return `[${values.join(",")}]`;
}
