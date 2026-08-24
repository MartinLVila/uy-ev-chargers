import { readFile } from "node:fs/promises";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "../../src/lib/db/schema";

const MIGRATIONS_DIR = path.join(process.cwd(), "drizzle");

export type TestDatabase = ReturnType<typeof drizzle<typeof schema>>;

export async function createTestDatabase(): Promise<{
  db: TestDatabase;
  close: () => Promise<void>;
}> {
  const client = new PGlite();
  await client.waitReady;

  const migration = await readFile(path.join(MIGRATIONS_DIR, "0000_initial_schema.sql"), "utf8");
  for (const statement of migration.split("--> statement-breakpoint")) {
    const trimmed = statement.trim();
    if (trimmed.length > 0) await client.exec(trimmed);
  }

  return {
    db: drizzle(client, { schema }),
    close: () => client.close(),
  };
}
