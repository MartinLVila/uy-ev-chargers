import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { connectorStates } from "../src/lib/db/schema";
import { runIngestion } from "../src/lib/ingest/pipeline";
import { getHourlyUsage, getUsageBreakdown, type SqlRunner } from "../src/lib/metrics/queries";
import { createTestDatabase, type TestDatabase } from "./helpers/database";
import { station, successFeed } from "./helpers/feed";

const WINDOW_FROM = new Date("2026-03-10T00:00:00Z");
const WINDOW_TO = new Date("2026-03-11T00:00:00Z");
const WINDOW = { from: WINDOW_FROM, to: WINDOW_TO };
const TWO_DAY_WINDOW = { from: WINDOW_FROM, to: new Date("2026-03-12T00:00:00Z") };
const HOUR_MS = 60 * 60 * 1000;
const MONTEVIDEO_IS_BEHIND_UTC_BY = 3;

describe("usage queries", () => {
  let db: TestDatabase;
  let close: () => Promise<void>;
  let runner: SqlRunner;
  let groupId: number;

  beforeEach(async () => {
    ({ db, close } = await createTestDatabase());
    runner = db as unknown as SqlRunner;

    await runIngestion(db, {
      observedAt: new Date("2026-01-01T00:00:00Z"),
      feed: successFeed([
        station({ name: "Solo", lat: -34.9, lng: -56.1, connectors: [{ count: 1 }] }),
      ]),
    });

    const [group] = await db.query.connectorGroups.findMany();
    groupId = group.id;
    await db.delete(connectorStates);
  });

  afterEach(async () => {
    await close();
  });

  async function record(
    startedAt: Date,
    endedAt: Date | null,
    statusDetail = "Charging",
    health = "operational",
  ) {
    await db.insert(connectorStates).values({
      connectorGroupId: groupId,
      statusDetail,
      health,
      connectorCount: 1,
      startedAt,
      endedAt,
    });
  }

  async function inUseHours(): Promise<number> {
    return (await getUsageBreakdown(runner, WINDOW)).connectorHours.inUse;
  }

  async function hoursCovered(
    window = WINDOW,
    timeZone?: string,
  ): Promise<number[]> {
    const hourly =
      timeZone === undefined
        ? await getHourlyUsage(runner, window)
        : await getHourlyUsage(runner, window, timeZone);
    return hourly.map((point) => point.hour);
  }

  it("counts only the part of an interval that started before the window", async () => {
    await record(
      new Date(WINDOW_FROM.getTime() - 10 * HOUR_MS),
      new Date(WINDOW_FROM.getTime() + 2 * HOUR_MS),
    );

    expect(await inUseHours()).toBe(2);
  });

  it("counts only the part of an interval that ends after the window", async () => {
    await record(
      new Date(WINDOW_TO.getTime() - 3 * HOUR_MS),
      new Date(WINDOW_TO.getTime() + 10 * HOUR_MS),
    );

    expect(await inUseHours()).toBe(3);
  });

  it("counts one window and no more for an interval that spans it entirely", async () => {
    await record(
      new Date(WINDOW_FROM.getTime() - HOUR_MS),
      new Date(WINDOW_TO.getTime() + HOUR_MS),
    );

    expect(await inUseHours()).toBe(24);
  });

  it("treats a still-open interval as running to the end of the window, not to now", async () => {
    await record(new Date(WINDOW_TO.getTime() - 5 * HOUR_MS), null);

    expect(await inUseHours()).toBe(5);
  });

  it("ignores an interval that closed before the window opened", async () => {
    await record(new Date(WINDOW_FROM.getTime() - 5 * HOUR_MS), new Date(WINDOW_FROM.getTime()));

    expect(await inUseHours()).toBe(0);
  });

  it("separates free time from time in use rather than counting both as usage", async () => {
    await record(WINDOW_FROM, new Date(WINDOW_FROM.getTime() + 6 * HOUR_MS), "Disponible");
    await record(
      new Date(WINDOW_FROM.getTime() + 6 * HOUR_MS),
      new Date(WINDOW_FROM.getTime() + 18 * HOUR_MS),
    );

    const usage = await getUsageBreakdown(runner, WINDOW);

    expect(usage.connectorHours.free).toBe(6);
    expect(usage.connectorHours.inUse).toBe(12);
    expect(usage.utilization).toBeCloseTo(12 / 18, 4);
  });

  it("keeps faulted time out of the utilisation denominator", async () => {
    await record(WINDOW_FROM, new Date(WINDOW_FROM.getTime() + 4 * HOUR_MS), "Disponible");
    await record(
      new Date(WINDOW_FROM.getTime() + 4 * HOUR_MS),
      new Date(WINDOW_FROM.getTime() + 8 * HOUR_MS),
    );
    await record(
      new Date(WINDOW_FROM.getTime() + 8 * HOUR_MS),
      new Date(WINDOW_FROM.getTime() + 20 * HOUR_MS),
      "Fuera de servicio",
      "faulted",
    );

    const usage = await getUsageBreakdown(runner, WINDOW);

    expect(usage.connectorHours.broken).toBe(12);
    expect(usage.utilization).toBeCloseTo(4 / 8, 4);
    expect(usage.byType[0].brokenShare).toBeCloseTo(12 / 20, 4);
  });

  it("counts a detail written by ingestion as free, not merely one written by hand", async () => {
    await runIngestion(db, {
      observedAt: WINDOW_FROM,
      feed: successFeed([
        station({
          name: "Solo",
          lat: -34.9,
          lng: -56.1,
          connectors: [{ count: 1, statusDetail: "Disponible" }],
        }),
      ]),
    });

    const usage = await getUsageBreakdown(runner, WINDOW);

    expect(usage.connectorHours.free).toBe(24);
    expect(usage.connectorHours.inUse).toBe(0);
  });

  it("splits an interval across the hours it actually covers", async () => {
    await record(new Date("2026-03-10T09:00:00Z"), new Date("2026-03-10T12:00:00Z"));

    expect(await hoursCovered(WINDOW, "UTC")).toEqual([9, 10, 11]);
  });

  it("wraps an interval crossing midnight into the following day's hours", async () => {
    await record(new Date("2026-03-10T23:00:00Z"), new Date("2026-03-11T01:00:00Z"));

    expect(await hoursCovered(TWO_DAY_WINDOW, "UTC")).toEqual([0, 23]);
  });

  it("buckets by Montevideo local time when no zone is given", async () => {
    await record(new Date("2026-03-10T23:00:00Z"), new Date("2026-03-11T01:00:00Z"));

    const localStart = 23 - MONTEVIDEO_IS_BEHIND_UTC_BY;

    expect(await hoursCovered(TWO_DAY_WINDOW)).toEqual([localStart, localStart + 1]);
  });

  it("reports full utilisation for an hour spent entirely in use", async () => {
    await record(new Date("2026-03-10T09:00:00Z"), new Date("2026-03-10T10:00:00Z"));

    const hourly = await getHourlyUsage(runner, WINDOW, "UTC");

    expect(hourly.find((point) => point.hour === 9)?.utilization).toBe(1);
  });
});
