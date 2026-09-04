import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runIngestion } from "../src/lib/ingest/pipeline";
import { stations } from "../src/lib/db/schema";
import { coordinateKey } from "../src/lib/ute/normalize";
import { createTestDatabase, type TestDatabase } from "./helpers/database";
import { station, successFeed } from "./helpers/feed";

const T0 = new Date("2026-01-01T00:00:00Z");
const T1 = new Date("2026-01-01T00:15:00Z");

const HERE = { lat: -34.9, lng: -56.15 };
const THERE = { lat: -34.8, lng: -56.05 };
const ELSEWHERE = { lat: -34.7, lng: -55.95 };

describe("a station's coordinates and the key that indexes them", () => {
  let db: TestDatabase;
  let close: () => Promise<void>;

  beforeEach(async () => {
    ({ db, close } = await createTestDatabase());
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await close();
  });

  async function storedRows() {
    return db.select().from(stations);
  }

  const swapped = successFeed([
    station({ name: "Joanico", ...THERE }),
    station({ name: "Solymar", ...HERE }),
  ]);

  it("never leaves a row whose key contradicts its own coordinates", async () => {
    await runIngestion(db, {
      observedAt: T0,
      feed: successFeed([
        station({ name: "Joanico", ...HERE }),
        station({ name: "Solymar", ...THERE }),
      ]),
    });

    await runIngestion(db, { observedAt: T1, feed: swapped });

    for (const row of await storedRows()) {
      expect(coordinateKey(row.latitude, row.longitude)).toBe(row.coordKey);
    }
  });

  it("says so when it refuses to move a station onto coordinates another one holds", async () => {
    const complained = vi.spyOn(console, "warn").mockImplementation(() => {});

    await runIngestion(db, {
      observedAt: T0,
      feed: successFeed([
        station({ name: "Joanico", ...HERE }),
        station({ name: "Solymar", ...THERE }),
      ]),
    });

    await runIngestion(db, { observedAt: T1, feed: swapped });

    const said = complained.mock.calls.map((call) => String(call[0])).join(" ");
    expect(said).toContain("coordinates held by station");
  });

  it("does not abort the poll when a new station arrives at coordinates still held", async () => {
    await runIngestion(db, {
      observedAt: T0,
      feed: successFeed([
        station({ name: "Joanico", ...HERE }),
        station({ name: "Solymar", ...THERE }),
      ]),
    });

    const contested = await runIngestion(db, {
      observedAt: T1,
      feed: successFeed([
        station({ name: "Joanico", ...THERE }),
        station({ name: "Solymar", ...ELSEWHERE }),
        station({ name: "Nueva", ...HERE }),
      ]),
    });

    expect(contested.outcome).toBe("success");
    const keys = (await storedRows()).map((row) => row.coordKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("keeps polling after a station appears where a stale key still points", async () => {
    await runIngestion(db, {
      observedAt: T0,
      feed: successFeed([
        station({ name: "Joanico", ...HERE }),
        station({ name: "Solymar", ...THERE }),
      ]),
    });

    await runIngestion(db, { observedAt: T1, feed: swapped });

    const third = await runIngestion(db, {
      observedAt: new Date("2026-01-01T00:30:00Z"),
      feed: successFeed([
        station({ name: "Joanico", ...THERE }),
        station({ name: "Solymar", ...HERE }),
        station({ name: "Nueva", ...ELSEWHERE }),
      ]),
    });

    expect(third.outcome).toBe("success");
    const keys = (await storedRows()).map((row) => row.coordKey);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
