import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { connectorStates } from "../src/lib/db/schema";
import { runIngestion } from "../src/lib/ingest/pipeline";
import { getStationHourlyUsage, type SqlRunner } from "../src/lib/metrics/queries";
import { createTestDatabase, type TestDatabase } from "./helpers/database";
import { station, successFeed } from "./helpers/feed";

const WINDOW_FROM = new Date("2026-03-10T00:00:00Z");
const WINDOW_TO = new Date("2026-03-11T00:00:00Z");
const WINDOW = { from: WINDOW_FROM, to: WINDOW_TO };
const TWO_DAY_WINDOW = { from: WINDOW_FROM, to: new Date("2026-03-12T00:00:00Z") };
const HOUR_MS = 60 * 60 * 1000;
const MONTEVIDEO_IS_BEHIND_UTC_BY = 3;

describe("station hourly usage", () => {
  let db: TestDatabase;
  let close: () => Promise<void>;
  let runner: SqlRunner;
  let fastId: number;
  let slowId: number;

  beforeEach(async () => {
    ({ db, close } = await createTestDatabase());
    runner = db as unknown as SqlRunner;

    await runIngestion(db, {
      observedAt: new Date("2026-01-01T00:00:00Z"),
      feed: successFeed([
        station({
          name: "Pair",
          lat: -34.9,
          lng: -56.1,
          connectors: [
            { count: 2, type: "CCS2", power: 60 },
            { count: 1, type: "Tipo 2", power: 22 },
          ],
        }),
        station({ name: "Elsewhere", lat: -31.4, lng: -57.9, connectors: [{ count: 1 }] }),
      ]),
    });

    const groups = await db.query.connectorGroups.findMany();
    fastId = groups.find((group) => group.connectorType === "CCS2")!.id;
    slowId = groups.find((group) => group.connectorType === "Tipo 2")!.id;
    await db.delete(connectorStates);
  });

  afterEach(async () => {
    await close();
  });

  async function record(
    connectorGroupId: number,
    startedAt: Date,
    endedAt: Date | null,
    statusDetail = "Charging",
    health = "operational",
    connectorCount = 1,
  ) {
    await db.insert(connectorStates).values({
      connectorGroupId,
      statusDetail,
      health,
      connectorCount,
      startedAt,
      endedAt,
    });
  }

  function hourOf(groups: Awaited<ReturnType<typeof getStationHourlyUsage>>, id: number, hour: number) {
    return groups.find((group) => group.connectorGroupId === id)?.hours.find((h) => h.hour === hour);
  }

  it("reports each connector group separately rather than blending the station", async () => {
    await record(fastId, new Date("2026-03-10T09:00:00Z"), new Date("2026-03-10T10:00:00Z"));
    await record(
      slowId,
      new Date("2026-03-10T09:00:00Z"),
      new Date("2026-03-10T10:00:00Z"),
      "Disponible",
    );

    const groups = await getStationHourlyUsage(runner, "pair", WINDOW, "UTC");

    expect(groups).toHaveLength(2);
    expect(hourOf(groups, fastId, 9)?.utilization).toBe(1);
    expect(hourOf(groups, slowId, 9)?.utilization).toBe(0);
  });

  it("leaves out an hour it never observed instead of reporting it as unused", async () => {
    await record(fastId, new Date("2026-03-10T09:00:00Z"), new Date("2026-03-10T10:00:00Z"));

    const groups = await getStationHourlyUsage(runner, "pair", WINDOW, "UTC");

    expect(groups[0].hours.map((point) => point.hour)).toEqual([9]);
    expect(hourOf(groups, fastId, 3)).toBeUndefined();
  });

  it("says how much time each hour was observed for", async () => {
    await record(fastId, new Date("2026-03-10T09:00:00Z"), new Date("2026-03-10T09:15:00Z"));
    await record(fastId, new Date("2026-03-10T11:00:00Z"), new Date("2026-03-10T12:00:00Z"));

    const groups = await getStationHourlyUsage(runner, "pair", WINDOW, "UTC");

    expect(hourOf(groups, fastId, 9)?.observedHours).toBe(0.25);
    expect(hourOf(groups, fastId, 11)?.observedHours).toBe(1);
  });

  it("keeps a barely observed hour distinguishable from a fully observed one", async () => {
    await record(fastId, new Date("2026-03-10T09:00:00Z"), new Date("2026-03-10T09:06:00Z"));
    await record(fastId, new Date("2026-03-11T11:00:00Z"), new Date("2026-03-12T00:00:00Z"));

    const groups = await getStationHourlyUsage(runner, "pair", TWO_DAY_WINDOW, "UTC");

    expect(hourOf(groups, fastId, 9)?.observedHours).toBe(0.1);
    expect(hourOf(groups, fastId, 11)?.observedHours).toBe(1);
    expect(hourOf(groups, fastId, 9)?.utilization).toBe(1);
    expect(hourOf(groups, fastId, 11)?.utilization).toBe(1);
  });

  it("splits an interval across the hours it actually covers", async () => {
    await record(fastId, new Date("2026-03-10T09:00:00Z"), new Date("2026-03-10T12:00:00Z"));

    const groups = await getStationHourlyUsage(runner, "pair", WINDOW, "UTC");

    expect(groups[0].hours.map((point) => point.hour)).toEqual([9, 10, 11]);
  });

  it("counts an interval shorter than an hour against only the part it covers", async () => {
    await record(fastId, new Date("2026-03-10T09:00:00Z"), new Date("2026-03-10T09:30:00Z"));
    await record(
      fastId,
      new Date("2026-03-10T09:30:00Z"),
      new Date("2026-03-10T10:00:00Z"),
      "Disponible",
    );

    const groups = await getStationHourlyUsage(runner, "pair", WINDOW, "UTC");

    expect(hourOf(groups, fastId, 9)?.utilization).toBe(0.5);
    expect(hourOf(groups, fastId, 9)?.observedHours).toBe(1);
  });

  it("wraps an interval crossing midnight into the following day's hours", async () => {
    await record(fastId, new Date("2026-03-10T23:00:00Z"), new Date("2026-03-11T01:00:00Z"));

    const groups = await getStationHourlyUsage(runner, "pair", TWO_DAY_WINDOW, "UTC");

    expect(groups[0].hours.map((point) => point.hour)).toEqual([0, 23]);
  });

  it("buckets by Montevideo local time when no zone is given", async () => {
    await record(fastId, new Date("2026-03-10T23:00:00Z"), new Date("2026-03-11T01:00:00Z"));

    const groups = await getStationHourlyUsage(runner, "pair", TWO_DAY_WINDOW);
    const localStart = 23 - MONTEVIDEO_IS_BEHIND_UTC_BY;

    expect(groups[0].hours.map((point) => point.hour)).toEqual([localStart, localStart + 1]);
  });

  it("keeps out-of-service time out of the utilisation it reports", async () => {
    await record(fastId, new Date("2026-03-10T09:00:00Z"), new Date("2026-03-10T09:30:00Z"));
    await record(
      fastId,
      new Date("2026-03-10T09:30:00Z"),
      new Date("2026-03-10T10:00:00Z"),
      "Fuera de servicio",
      "faulted",
    );

    const groups = await getStationHourlyUsage(runner, "pair", WINDOW, "UTC");

    expect(hourOf(groups, fastId, 9)?.utilization).toBe(1);
    expect(hourOf(groups, fastId, 9)?.brokenShare).toBe(0.5);
  });

  it("reports an hour spent wholly out of service without calling it used", async () => {
    await record(
      fastId,
      new Date("2026-03-10T09:00:00Z"),
      new Date("2026-03-10T10:00:00Z"),
      "Fuera de servicio",
      "faulted",
    );

    const groups = await getStationHourlyUsage(runner, "pair", WINDOW, "UTC");

    expect(hourOf(groups, fastId, 9)?.brokenShare).toBe(1);
    expect(hourOf(groups, fastId, 9)?.utilization).toBe(0);
    expect(hourOf(groups, fastId, 9)?.observedHours).toBe(1);
  });

  it("weights utilisation by how many connectors the group holds", async () => {
    await record(
      fastId,
      new Date("2026-03-10T09:00:00Z"),
      new Date("2026-03-10T10:00:00Z"),
      "Charging",
      "operational",
      3,
    );
    await record(
      fastId,
      new Date("2026-03-10T09:00:00Z"),
      new Date("2026-03-10T10:00:00Z"),
      "Disponible",
      "operational",
      1,
    );

    const groups = await getStationHourlyUsage(runner, "pair", WINDOW, "UTC");

    expect(hourOf(groups, fastId, 9)?.utilization).toBe(0.75);
  });

  it("measures observed time in wall clock, not multiplied by the connector count", async () => {
    await record(
      fastId,
      new Date("2026-03-10T09:00:00Z"),
      new Date("2026-03-10T10:00:00Z"),
      "Charging",
      "operational",
      4,
    );

    const groups = await getStationHourlyUsage(runner, "pair", WINDOW, "UTC");

    expect(hourOf(groups, fastId, 9)?.observedHours).toBe(1);
  });

  it("ignores the connector groups of other stations", async () => {
    const groups = await db.query.connectorGroups.findMany();
    const elsewhere = groups.find((group) => group.id !== fastId && group.id !== slowId)!;
    await record(elsewhere.id, new Date("2026-03-10T09:00:00Z"), new Date("2026-03-10T10:00:00Z"));

    expect(await getStationHourlyUsage(runner, "pair", WINDOW, "UTC")).toEqual([]);
  });

  it("carries the identity of each group so a chart can label it", async () => {
    await record(slowId, new Date("2026-03-10T09:00:00Z"), new Date("2026-03-10T10:00:00Z"));

    const [group] = await getStationHourlyUsage(runner, "pair", WINDOW, "UTC");

    expect(group.connectorType).toBe("Tipo 2");
    expect(group.powerKw).toBe(22);
    expect(group.hasCable).toBe(true);
  });

  it("counts only the part of an interval that falls inside the window", async () => {
    await record(
      fastId,
      new Date(WINDOW_FROM.getTime() - 2 * HOUR_MS),
      new Date(WINDOW_FROM.getTime() + HOUR_MS),
    );

    const groups = await getStationHourlyUsage(runner, "pair", WINDOW, "UTC");

    expect(groups[0].hours.map((point) => point.hour)).toEqual([0]);
    expect(hourOf(groups, fastId, 0)?.observedHours).toBe(1);
  });

  it("treats a still-open interval as running to the end of the window, not to now", async () => {
    await record(fastId, new Date(WINDOW_TO.getTime() - 2 * HOUR_MS), null);

    const groups = await getStationHourlyUsage(runner, "pair", WINDOW, "UTC");

    expect(groups[0].hours.map((point) => point.hour)).toEqual([22, 23]);
  });
});
