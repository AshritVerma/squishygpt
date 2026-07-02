import { config } from "dotenv";
config({ path: ".env.local" });
config();
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getPool, closePool } from "../src/lib/db";

async function main() {
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
