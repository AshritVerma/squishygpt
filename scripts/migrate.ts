import { config } from "dotenv";
config({ path: ".env.local" });
config();
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getPool, closePool } from "../src/lib/db";

async function main() {
  // Railway's pre-deploy step runs this for every service built from the repo,
  // including any without a Postgres attached; those skip instead of failing.
  if (process.argv.includes("--if-configured") && !process.env.DATABASE_URL) {
    console.log("DATABASE_URL is not set; skipping migration.");
    return;
  }
  const schema = readFileSync(join(process.cwd(), "db", "schema.sql"), "utf8");
  console.log("Applying db/schema.sql ...");
  await getPool().query(schema);
  console.log("✓ Schema applied.");
  await closePool();
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
