import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { connectorStates } from "../src/lib/db/schema";
import { runIngestion } from "../src/lib/ingest/pipeline";
import { getStationDetail, type SqlRunner } from "../src/lib/metrics/queries";
import { windowFromDays } from "../src/lib/metrics/window";
import { createTestDatabase, type TestDatabase } from "./helpers/database";
import { station, successFeed } from "./helpers/feed";

const QUIET_GROUP_OBSERVED_AT = new Date("2026-02-01T00:00:00Z");
const NOW = new Date("2026-03-01T00:00:00Z");
const CHURN_STATES = 160;
const RETAINED_PER_GROUP = 150;
const HOUR_MS = 60 * 60 * 1000;

describe("station timeline row cap", () => {
  let db: TestDatabase;
  let close: () => Promise<void>;
  let runner: SqlRunner;

  beforeEach(async () => {
    ({ db, close } = await createTestDatabase());
    runner = db as unknown as SqlRunner;

    await runIngestion(db, {
      observedAt: QUIET_GROUP_OBSERVED_AT,
      feed: successFeed([
        station({
          name: "Mixed",
          lat: -34.9,
          lng: -56.1,
          connectors: [
            { count: 2, type: "CCS2", power: 60 },
            { count: 1, type: "Tipo 2", power: 22 },
          ],
        }),
      ]),
    });

    const groups = await db.query.connectorGroups.findMany();
    const busy = groups.find((group) => group.connectorType === "CCS2");
    if (!busy) throw new Error("expected the fixture to create a CCS2 group");

    await db.insert(connectorStates).values(
      Array.from({ length: CHURN_STATES }, (_, index) => {
        const startedAt = new Date(NOW.getTime() - (index + 1) * HOUR_MS);
        return {
          connectorGroupId: busy.id,
          statusDetail: index % 2 === 0 ? "Busy" : "Available",
          health: "operational",
          connectorCount: 2,
          startedAt,
          endedAt: new Date(startedAt.getTime() + HOUR_MS),
        };
      }),
    );
  });

  afterEach(async () => {
    await close();
  });

  it("keeps the quiet connector group visible when a busy one runs past the cap", async () => {
    const detail = await getStationDetail(runner, "mixed", windowFromDays(90, NOW));

    const types = new Set(detail?.timeline.map((entry) => entry.connectorType));

    expect(types.has("Tipo 2")).toBe(true);
    expect(types.has("CCS2")).toBe(true);
  });

  it("caps the busy group without touching the quiet one", async () => {
    const detail = await getStationDetail(runner, "mixed", windowFromDays(90, NOW));

    const byType = (type: string) =>
      detail?.timeline.filter((entry) => entry.connectorType === type) ?? [];

    expect(byType("CCS2")).toHaveLength(RETAINED_PER_GROUP);
    expect(byType("Tipo 2")).toHaveLength(1);
  });

  it("reports how far back the timeline can be trusted", async () => {
    const detail = await getStationDetail(runner, "mixed", windowFromDays(90, NOW));

    const oldestRetainedBusyState = detail?.timeline
      .filter((entry) => entry.connectorType === "CCS2")
      .map((entry) => entry.startedAt)
      .sort()[0];

    expect(detail?.timelineTruncated).toBe(true);
    expect(detail?.timelineCoversFrom).toBe(oldestRetainedBusyState);
  });

  it("reports full coverage when no group reaches the cap", async () => {
    const detail = await getStationDetail(runner, "mixed", windowFromDays(1, NOW));

    expect(detail?.timelineTruncated).toBe(false);
    expect(detail?.timelineCoversFrom).toBeNull();
  });
});
