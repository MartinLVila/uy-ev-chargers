import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { withIngestionLock, type WriteDb } from "../src/lib/db/write-client";
import { createTestDatabase, type TestDatabase } from "./helpers/database";

const BUSY = "busy" as const;

describe("withIngestionLock", () => {
  let db: TestDatabase;
  let close: () => Promise<void>;
  let lockable: WriteDb;

  beforeEach(async () => {
    ({ db, close } = await createTestDatabase());
    lockable = db as unknown as WriteDb;
  });

  afterEach(async () => {
    await close();
  });

  it("runs the work when nothing holds the lock", async () => {
    const result = await withIngestionLock(lockable, async () => "ran", () => BUSY);
    expect(result).toBe("ran");
  });

  it("releases the lock once the work finishes", async () => {
    await withIngestionLock(lockable, async () => "first", () => BUSY);
    const second = await withIngestionLock(lockable, async () => "second", () => BUSY);
    expect(second).toBe("second");
  });

  it("releases the lock when the work throws", async () => {
    await expect(
      withIngestionLock(
        lockable,
        async () => {
          throw new Error("ingestion blew up");
        },
        () => BUSY,
      ),
    ).rejects.toThrow("ingestion blew up");

    const next = await withIngestionLock(lockable, async () => "next", () => BUSY);
    expect(next).toBe("next");
  });

  it("takes over a lock left behind by a run that never finished", async () => {
    await db.execute(sql`
      INSERT INTO ingestion_locks (name, held_until)
      VALUES ('poll', now() - interval '1 minute')
    `);

    const result = await withIngestionLock(lockable, async () => "took over", () => BUSY);
    expect(result).toBe("took over");
  });

  it("does not take over a lock that is still within its expiry", async () => {
    await db.execute(sql`
      INSERT INTO ingestion_locks (name, held_until)
      VALUES ('poll', now() + interval '4 minutes')
    `);

    const result = await withIngestionLock(lockable, async () => "took over", () => BUSY);
    expect(result).toBe(BUSY);
  });
});
