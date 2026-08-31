import { readdirSync, readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import {
  MIN_SECONDS_BETWEEN_SUCCESSFUL_POLLS,
  startIngestion,
} from "../src/lib/ingest/entry-point";
import type { WriteDb } from "../src/lib/db/write-client";
import { createTestDatabase, type TestDatabase } from "./helpers/database";
import { station, successFeed } from "./helpers/feed";

const FEED = () => Promise.resolve(successFeed([station({ name: "Solo", connectors: [{ count: 1 }] })]));

const ENTRY_POINT = "src/lib/ingest/entry-point.ts";
const PIPELINE = "src/lib/ingest/pipeline.ts";
const WRITE_CLIENT = "src/lib/db/write-client.ts";
const SCHEMA = "src/lib/db/schema.ts";

function productionSources(): string[] {
  const found: string[] = [];
  const walk = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const here = `${directory}/${entry.name}`;
      if (entry.isDirectory()) walk(here);
      else if (/[.]tsx?$/.test(entry.name)) found.push(here);
    }
  };
  walk("src");
  walk("scripts");
  return found;
}

function sourceOf(path: string): string {
  return readFileSync(path, "utf8");
}

const INGESTION_INTERNALS = [
  { token: "runIngestion", declaredBy: [PIPELINE] },
  { token: "withIngestionLock", declaredBy: [WRITE_CLIENT] },
  { token: "ingestion_locks", declaredBy: [WRITE_CLIENT, SCHEMA] },
  { token: "MIN_SECONDS_BETWEEN_SUCCESSFUL_POLLS", declaredBy: [ENTRY_POINT] },
];

describe("ingestion has exactly one entry point", () => {
  const sources = productionSources();

  it("scans the files it claims to scan", () => {
    expect(sources).toContain(ENTRY_POINT);
    expect(sources).toContain("src/app/api/poll/route.ts");
    expect(sources).toContain("scripts/poll.ts");
  });

  for (const { token, declaredBy } of INGESTION_INTERNALS) {
    it(`nothing but the entry point reaches for ${token}`, () => {
      const allowed = [...declaredBy, ENTRY_POINT];
      const reaching = sources.filter(
        (path) => !allowed.includes(path) && sourceOf(path).includes(token),
      );
      expect(reaching).toEqual([]);
    });
  }

  it("leaves startIngestion as the only way in for anything that writes what it polled", () => {
    const declaresThem = [ENTRY_POINT, PIPELINE];
    const writers = sources
      .filter((path) => !declaresThem.includes(path))
      .filter((path) => {
        const source = sourceOf(path);
        return source.includes("ingest/pipeline") || source.includes("ingest/entry-point");
      });

    expect(writers.length).toBeGreaterThan(0);
    for (const caller of writers) {
      expect(sourceOf(caller)).toContain("startIngestion");
    }
  });
});

describe("every caller reaches ingestion through the same guard", () => {
  let db: TestDatabase;
  let close: () => Promise<void>;
  let writable: WriteDb;

  beforeEach(async () => {
    ({ db, close } = await createTestDatabase());
    writable = db as unknown as WriteDb;
  });

  afterEach(async () => {
    await close();
    vi.useRealTimers();
  });

  it("ingests when nothing has run before", async () => {
    const attempt = await startIngestion(writable, FEED);

    expect(attempt.status).toBe("ingested");
    if (attempt.status === "ingested") expect(attempt.result.outcome).toBe("success");
  });

  it("refuses a second poll moments after a successful one", async () => {
    await startIngestion(writable, FEED);
    const second = await startIngestion(writable, FEED);

    expect(second.status).toBe("polled-recently");
    if (second.status === "polled-recently") {
      expect(second.secondsSinceLastSuccess).toBeLessThan(MIN_SECONDS_BETWEEN_SUCCESSFUL_POLLS);
    }
  });

  it("allows a poll again once the interval has passed", async () => {
    await startIngestion(writable, FEED);

    await db.execute(
      sql`UPDATE poll_runs SET started_at = started_at - ${`${MIN_SECONDS_BETWEEN_SUCCESSFUL_POLLS + 5} seconds`}::interval`,
    );

    const second = await startIngestion(writable, FEED);
    expect(second.status).toBe("ingested");
  });

  it("never fetches the feed when it is going to refuse the poll", async () => {
    await startIngestion(writable, FEED);

    const fetchFeed = vi.fn(FEED);
    const second = await startIngestion(writable, fetchFeed);

    expect(second.status).toBe("polled-recently");
    expect(fetchFeed).not.toHaveBeenCalled();
  });

  it("reports a poll already in flight rather than waiting for it", async () => {
    await db.execute(
      sql`INSERT INTO ingestion_locks (name, held_until) VALUES ('poll', now() + '300 seconds'::interval)`,
    );

    const attempt = await startIngestion(writable, FEED);
    expect(attempt.status).toBe("already-running");
  });

  it("releases the lock after refusing, so the next poll is not blocked", async () => {
    await startIngestion(writable, FEED);
    await startIngestion(writable, FEED);

    const { rows } = await db.execute<{ count: string }>(
      sql`SELECT count(*)::text AS count FROM ingestion_locks`,
    );
    expect(rows[0].count).toBe("0");
  });
});
