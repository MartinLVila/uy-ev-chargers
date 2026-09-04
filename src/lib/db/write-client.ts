import { neonConfig, Pool } from "@neondatabase/serverless";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";
import { connectionString } from "./client";
import * as schema from "./schema";

neonConfig.webSocketConstructor = ws;

export function createWriteDatabase() {
  const pool = new Pool({ connectionString: connectionString() });
  return {
    db: drizzle(pool, { schema }),
    pool,
    close: () => pool.end(),
  };
}

const INGESTION_LOCK_NAME = "poll";
const INGESTION_LOCK_SECONDS = 300;

export type WriteDb = ReturnType<typeof createWriteDatabase>["db"];

export async function withIngestionLock<T>(
  db: WriteDb,
  run: () => Promise<T>,
  onBusy: () => T,
): Promise<T> {
  const lease = await acquireIngestionLock(db);
  if (lease === null) return onBusy();

  try {
    return await run();
  } finally {
    await releaseIngestionLock(db, lease);
  }
}

async function acquireIngestionLock(db: WriteDb): Promise<string | null> {
  const { rows } = await db.execute<{ held_until: string }>(sql`
    INSERT INTO ingestion_locks (name, held_until)
    VALUES (${INGESTION_LOCK_NAME}, now() + ${`${INGESTION_LOCK_SECONDS} seconds`}::interval)
    ON CONFLICT (name) DO UPDATE
      SET held_until = EXCLUDED.held_until
      WHERE ingestion_locks.held_until < now()
    RETURNING held_until::text AS held_until
  `);

  return rows[0]?.held_until ?? null;
}

async function releaseIngestionLock(db: WriteDb, lease: string): Promise<void> {
  try {
    const { rows } = await db.execute<{ name: string }>(sql`
      DELETE FROM ingestion_locks
      WHERE name = ${INGESTION_LOCK_NAME} AND held_until = ${lease}::timestamptz
      RETURNING name
    `);

    if (rows.length === 0) {
      console.warn(
        `Ingestion outran its ${INGESTION_LOCK_SECONDS}s lock lease; ` +
          "the lease it held was no longer on record and it released nothing",
      );
    }
  } catch (error: unknown) {
    console.error("Releasing the ingestion lock failed", error);
  }
}
