import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { pollRuns } from "../src/lib/db/schema";
import { runIngestion } from "../src/lib/ingest/pipeline";
import {
  getDailyHistory,
  getDepartmentBreakdown,
  getFeedHealth,
  getNetworkSnapshot,
  getStationDetail,
  getStationReliability,
  type SqlRunner,
} from "../src/lib/metrics/queries";
import { createTestDatabase, type TestDatabase } from "./helpers/database";
import { station, successFeed } from "./helpers/feed";

const DAY_START = new Date("2026-03-01T00:00:00Z");
const MIDDAY = new Date("2026-03-01T12:00:00Z");
const NEXT_DAY = new Date("2026-03-02T00:00:00Z");

describe("metrics", () => {
  let db: TestDatabase;
  let close: () => Promise<void>;
  let runner: SqlRunner;

  beforeEach(async () => {
    ({ db, close } = await createTestDatabase());
    runner = db as unknown as SqlRunner;
  });

  afterEach(async () => {
    await close();
  });

  it("summarises the current network state by connector health", async () => {
    await runIngestion(db, {
      observedAt: DAY_START,
      feed: successFeed([
        station({ name: "Healthy", lat: -34.9, lng: -56.1, connectors: [{ count: 4 }] }),
        station({
          name: "Broken",
          lat: -34.8,
          lng: -56.2,
          connectors: [{ count: 2, statusDetail: "Faulted", status: 4 }],
        }),
        station({ name: "Silent", lat: -34.7, lng: -56.3, connectors: [] }),
      ]),
    });

    const snapshot = await getNetworkSnapshot(runner);

    expect(snapshot.stations).toEqual({ total: 3, listed: 2, silent: 1, delisted: 0 });
    expect(snapshot.connectors.reported).toBe(6);
    expect(snapshot.connectors.operational).toBe(4);
    expect(snapshot.connectors.faulted).toBe(2);
    expect(snapshot.connectors.outOfService).toBe(2);
    expect(snapshot.lastSuccessfulPollAt).toBe(DAY_START.toISOString());
  });

  it("counts vanished capacity as out of service", async () => {
    await runIngestion(db, {
      observedAt: DAY_START,
      feed: successFeed([
        station({ name: "Gone", lat: -34.9, lng: -56.1, connectors: [{ count: 3 }] }),
        station({ name: "Anchor", lat: -34.8, lng: -56.2, connectors: [{ count: 1 }] }),
      ]),
    });
    await runIngestion(db, {
      observedAt: MIDDAY,
      feed: successFeed([station({ name: "Anchor", lat: -34.8, lng: -56.2, connectors: [{ count: 1 }] })]),
    });

    const snapshot = await getNetworkSnapshot(runner);

    expect(snapshot.stations.delisted).toBe(1);
    expect(snapshot.connectors.absent).toBe(3);
    expect(snapshot.connectors.outOfService).toBe(3);
    expect(snapshot.connectors.reported).toBe(1);
  });

  it("weights station availability by connector count and outage duration", async () => {
    await runIngestion(db, {
      observedAt: DAY_START,
      feed: successFeed([station({ name: "Joanico", lat: -34.9, lng: -56.1, connectors: [{ count: 2 }] })]),
    });
    await runIngestion(db, {
      observedAt: MIDDAY,
      feed: successFeed([
        station({
          name: "Joanico",
          lat: -34.9,
          lng: -56.1,
          connectors: [{ count: 2, statusDetail: "Faulted", status: 4 }],
        }),
      ]),
    });

    const [result] = await getStationReliability(runner, { from: DAY_START, to: NEXT_DAY });

    expect(result.name).toBe("Joanico");
    expect(result.connectorSeconds).toBe(2 * 24 * 3600);
    expect(result.outOfServiceSeconds).toBe(2 * 12 * 3600);
    expect(result.availability).toBeCloseTo(0.5, 6);
    expect(result.currentlyOutOfService).toBe(2);
  });

  it("clips intervals to the requested window", async () => {
    await runIngestion(db, {
      observedAt: DAY_START,
      feed: successFeed([station({ name: "Joanico", lat: -34.9, lng: -56.1, connectors: [{ count: 1 }] })]),
    });

    const [result] = await getStationReliability(runner, { from: MIDDAY, to: NEXT_DAY });

    expect(result.connectorSeconds).toBe(12 * 3600);
    expect(result.availability).toBeCloseTo(1, 6);
  });

  it("ranks the worst stations first when asked", async () => {
    await runIngestion(db, {
      observedAt: DAY_START,
      feed: successFeed([
        station({ name: "Fine", lat: -34.9, lng: -56.1, connectors: [{ count: 2 }] }),
        station({
          name: "Down",
          lat: -34.8,
          lng: -56.2,
          connectors: [{ count: 2, statusDetail: "Faulted", status: 4 }],
        }),
      ]),
    });

    const ranked = await getStationReliability(
      runner,
      { from: DAY_START, to: NEXT_DAY },
      { worstFirst: true },
    );

    expect(ranked.map((row) => row.name)).toEqual(["Down", "Fine"]);
    expect(ranked[0].availability).toBeCloseTo(0, 6);
  });

  it("detects how long the upstream payload has been identical", async () => {
    const digests = ["older", "frozen", "frozen", "frozen"];
    for (const [index, digest] of digests.entries()) {
      await db.insert(pollRuns).values({
        startedAt: new Date(DAY_START.getTime() + index * 900_000),
        durationMs: 100,
        outcome: "success",
        httpStatus: 200,
        stationCount: 212,
        connectorCount: 494,
        payloadDigest: digest,
        errorMessage: null,
      });
    }

    const health = await getFeedHealth(runner, { from: DAY_START, to: NEXT_DAY });

    expect(health.polls).toBe(4);
    expect(health.successes).toBe(4);
    expect(health.successRate).toBe(1);
    expect(health.distinctPayloads).toBe(2);
    expect(health.identicalPayloadStreak).toBe(3);
    expect(health.unchangedSince).toBe(new Date(DAY_START.getTime() + 900_000).toISOString());
  });

  it("reports the streak as the full history when the payload never changed", async () => {
    for (let index = 0; index < 3; index += 1) {
      await db.insert(pollRuns).values({
        startedAt: new Date(DAY_START.getTime() + index * 900_000),
        durationMs: 100,
        outcome: "success",
        httpStatus: 200,
        stationCount: 212,
        connectorCount: 494,
        payloadDigest: "same",
        errorMessage: null,
      });
    }

    const health = await getFeedHealth(runner, { from: DAY_START, to: NEXT_DAY });

    expect(health.identicalPayloadStreak).toBe(3);
    expect(health.unchangedSince).toBe(DAY_START.toISOString());
  });

  it("counts failed polls against the success rate", async () => {
    await db.insert(pollRuns).values([
      {
        startedAt: DAY_START,
        durationMs: 100,
        outcome: "success",
        httpStatus: 200,
        payloadDigest: "a",
        stationCount: 1,
        connectorCount: 1,
        errorMessage: null,
      },
      {
        startedAt: MIDDAY,
        durationMs: 50,
        outcome: "fetch_error",
        httpStatus: null,
        payloadDigest: null,
        stationCount: null,
        connectorCount: null,
        errorMessage: "timeout",
      },
    ]);

    const health = await getFeedHealth(runner, { from: DAY_START, to: NEXT_DAY });

    expect(health.polls).toBe(2);
    expect(health.failures).toBe(1);
    expect(health.successRate).toBeCloseTo(0.5, 6);
    expect(health.lastFailureAt).toBe(MIDDAY.toISOString());
  });

  it("builds a daily series weighted by time in state", async () => {
    await runIngestion(db, {
      observedAt: DAY_START,
      feed: successFeed([station({ name: "Joanico", lat: -34.9, lng: -56.1, connectors: [{ count: 4 }] })]),
    });
    await runIngestion(db, {
      observedAt: MIDDAY,
      feed: successFeed([
        station({
          name: "Joanico",
          lat: -34.9,
          lng: -56.1,
          connectors: [{ count: 4, statusDetail: "Faulted", status: 4 }],
        }),
      ]),
    });

    const series = await getDailyHistory(runner, { from: DAY_START, to: NEXT_DAY }, "UTC");
    const firstDay = series.find((point) => point.day === "2026-03-01");

    expect(firstDay).toBeDefined();
    expect(firstDay?.connectorsTracked).toBeCloseTo(4, 1);
    expect(firstDay?.connectorsAbsent).toBe(0);
    expect(firstDay?.connectorsOutOfService).toBeCloseTo(2, 1);
    expect(firstDay?.outOfServiceRatio).toBeCloseTo(0.5, 2);
  });

  it("buckets days in the requested time zone rather than the session default", async () => {
    await runIngestion(db, {
      observedAt: DAY_START,
      feed: successFeed([station({ name: "Joanico", lat: -34.9, lng: -56.1, connectors: [{ count: 1 }] })]),
    });

    const utc = await getDailyHistory(db as unknown as SqlRunner, { from: DAY_START, to: NEXT_DAY }, "UTC");
    const montevideo = await getDailyHistory(
      db as unknown as SqlRunner,
      { from: DAY_START, to: NEXT_DAY },
      "America/Montevideo",
    );

    expect(utc.map((point) => point.day)).toEqual(["2026-03-01"]);
    expect(montevideo.map((point) => point.day)).toEqual(["2026-02-28", "2026-03-01"]);
  });

  it("groups the current fleet by department", async () => {
    await runIngestion(db, {
      observedAt: DAY_START,
      feed: successFeed([
        station({ name: "A", lat: -34.9, lng: -56.1, department: "Montevideo", connectors: [{ count: 3 }] }),
        station({
          name: "B",
          lat: -34.8,
          lng: -56.2,
          department: "Montevideo",
          connectors: [{ count: 1, statusDetail: "Faulted", status: 4 }],
        }),
        station({ name: "C", lat: -34.4, lng: -57.8, department: "Colonia", connectors: [{ count: 2 }] }),
      ]),
    });

    const rows = await getDepartmentBreakdown(runner);
    const montevideo = rows.find((row) => row.department === "Montevideo");

    expect(montevideo).toEqual({
      department: "Montevideo",
      stations: 2,
      connectors: 4,
      operational: 3,
      faulted: 1,
      absent: 0,
      outOfService: 1,
    });
  });

  it("separates faulted from absent so a department fleet is not double counted", async () => {
    await runIngestion(db, {
      observedAt: DAY_START,
      feed: successFeed([
        station({
          name: "Mixed",
          lat: -34.9,
          lng: -56.1,
          department: "Colonia",
          connectors: [
            { count: 3, statusDetail: "Available", status: 0 },
            { count: 2, statusDetail: "Faulted", status: 4, power: 22, type: "Tipo 2" },
          ],
        }),
        station({ name: "Vanishing", lat: -34.4, lng: -57.8, department: "Colonia", connectors: [{ count: 4 }] }),
      ]),
    });

    await runIngestion(db, {
      observedAt: MIDDAY,
      feed: successFeed([
        station({
          name: "Mixed",
          lat: -34.9,
          lng: -56.1,
          department: "Colonia",
          connectors: [
            { count: 3, statusDetail: "Available", status: 0 },
            { count: 2, statusDetail: "Faulted", status: 4, power: 22, type: "Tipo 2" },
          ],
        }),
      ]),
    });

    const [colonia] = await getDepartmentBreakdown(runner);

    expect(colonia.connectors).toBe(5);
    expect(colonia.faulted).toBe(2);
    expect(colonia.absent).toBe(4);
    expect(colonia.outOfService).toBe(6);
    expect(colonia.connectors + colonia.absent).toBe(9);
  });

  it("returns a station timeline ordered newest first", async () => {
    await runIngestion(db, {
      observedAt: DAY_START,
      feed: successFeed([station({ name: "Joanico", lat: -34.9, lng: -56.1, connectors: [{ count: 2 }] })]),
    });
    await runIngestion(db, {
      observedAt: MIDDAY,
      feed: successFeed([
        station({
          name: "Joanico",
          lat: -34.9,
          lng: -56.1,
          connectors: [{ count: 2, statusDetail: "Faulted", status: 4 }],
        }),
      ]),
    });

    const detail = await getStationDetail(runner, "joanico", { from: DAY_START, to: NEXT_DAY });

    expect(detail).not.toBeNull();
    expect(detail?.presence).toBe("listed");
    expect(detail?.timeline).toHaveLength(2);
    expect(detail?.timeline[0].health).toBe("faulted");
    expect(detail?.timeline[0].endedAt).toBeNull();
    expect(detail?.timeline[1].health).toBe("operational");
    expect(detail?.timeline[1].endedAt).toBe(MIDDAY.toISOString());
  });

  it("returns null for an unknown station slug", async () => {
    const detail = await getStationDetail(runner, "does-not-exist", {
      from: DAY_START,
      to: NEXT_DAY,
    });
    expect(detail).toBeNull();
  });
});
