import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { and, eq, isNull } from "drizzle-orm";
import { runIngestion } from "../src/lib/ingest/pipeline";
import { connectorStates, pollRuns, stationStates, stations } from "../src/lib/db/schema";
import { createTestDatabase, type TestDatabase } from "./helpers/database";
import { failedFeed, station, successFeed } from "./helpers/feed";

const T0 = new Date("2026-01-01T00:00:00Z");
const T1 = new Date("2026-01-01T00:15:00Z");
const T2 = new Date("2026-01-01T00:30:00Z");

const FOUR_STATIONS = [
  station({ name: "One", lat: -34.1, lng: -56.1 }),
  station({ name: "Two", lat: -34.2, lng: -56.2 }),
  station({ name: "Three", lat: -34.3, lng: -56.3 }),
  station({ name: "Four", lat: -34.4, lng: -56.4 }),
];

describe("runIngestion", () => {
  let db: TestDatabase;
  let close: () => Promise<void>;

  beforeEach(async () => {
    ({ db, close } = await createTestDatabase());
  });

  afterEach(async () => {
    await close();
  });

  it("creates stations, groups and open intervals on the first poll", async () => {
    const result = await runIngestion(db, {
      observedAt: T0,
      feed: successFeed([
        station({ name: "Joanico", connectors: [{ count: 3 }, { count: 1, type: "Tipo 2", power: 22 }] }),
      ]),
    });

    expect(result.stationsCreated).toBe(1);
    expect(result.connectorGroupsCreated).toBe(2);
    expect(result.connectorsInFeed).toBe(4);
    expect(result.stationStateChanges).toBe(1);

    const open = await db.select().from(connectorStates);
    expect(open).toHaveLength(2);
    expect(open.every((row) => row.endedAt === null)).toBe(true);
    expect(open.every((row) => row.health === "operational")).toBe(true);
  });

  it("writes nothing new when the state is unchanged", async () => {
    const feed = successFeed([station({ name: "Joanico" })]);
    await runIngestion(db, { observedAt: T0, feed });
    const second = await runIngestion(db, { observedAt: T1, feed });

    expect(second.stationsCreated).toBe(0);
    expect(second.connectorStateChanges).toBe(0);
    expect(second.stationStateChanges).toBe(0);
    expect(second.payloadUnchanged).toBe(true);

    const rows = await db.select().from(connectorStates);
    expect(rows).toHaveLength(1);
    expect(rows[0].startedAt).toEqual(T0);
  });

  it("closes the previous interval when a connector becomes faulted", async () => {
    await runIngestion(db, {
      observedAt: T0,
      feed: successFeed([station({ name: "Joanico", connectors: [{ count: 2 }] })]),
    });
    await runIngestion(db, {
      observedAt: T1,
      feed: successFeed([
        station({ name: "Joanico", connectors: [{ count: 2, statusDetail: "Faulted", status: 4 }] }),
      ]),
    });

    const rows = await db.select().from(connectorStates).orderBy(connectorStates.startedAt);
    expect(rows).toHaveLength(2);
    expect(rows[0].endedAt).toEqual(T1);
    expect(rows[0].health).toBe("operational");
    expect(rows[1].endedAt).toBeNull();
    expect(rows[1].health).toBe("faulted");
    expect(rows[1].connectorCount).toBe(2);
  });

  it("marks a station delisted and its connectors absent when it leaves the feed", async () => {
    await runIngestion(db, {
      observedAt: T0,
      feed: successFeed([
        station({ name: "Joanico", connectors: [{ count: 3 }] }),
        station({ name: "Leguizamon", lat: -34.89, lng: -56.14 }),
      ]),
    });

    await runIngestion(db, {
      observedAt: T1,
      feed: successFeed([station({ name: "Leguizamon", lat: -34.89, lng: -56.14 })]),
    });

    const presence = await db.select().from(stationStates);
    const delisted = presence.filter((row) => row.state === "delisted" && row.endedAt === null);
    expect(delisted).toHaveLength(1);

    const absent = (await db.select().from(connectorStates)).filter(
      (row) => row.health === "absent" && row.endedAt === null,
    );
    expect(absent).toHaveLength(1);
    expect(absent[0].connectorCount).toBe(3);
  });

  it("treats a station with no connector telemetry as silent", async () => {
    const result = await runIngestion(db, {
      observedAt: T0,
      feed: successFeed([station({ name: "Silent site", connectors: [] })]),
    });

    expect(result.connectorGroupsCreated).toBe(0);
    const presence = await db.select().from(stationStates);
    expect(presence[0].state).toBe("silent");
  });

  it("leaves connector intervals open when a station reports no telemetry at all", async () => {
    await runIngestion(db, {
      observedAt: T0,
      feed: successFeed([
        station({ name: "Joanico", connectors: [{ count: 2, statusDetail: "Disponible" }] }),
      ]),
    });

    const result = await runIngestion(db, {
      observedAt: T1,
      feed: successFeed([station({ name: "Joanico", connectors: null })]),
    });

    expect(result.connectorStateChanges).toBe(0);
    expect(result.connectorGroupsCreated).toBe(0);

    const rows = await db.select().from(connectorStates);
    expect(rows).toHaveLength(1);
    expect(rows[0].health).toBe("operational");
    expect(rows[0].connectorCount).toBe(2);
    expect(rows[0].endedAt).toBeNull();
  });

  it("keeps a station listed while its telemetry is unavailable", async () => {
    await runIngestion(db, {
      observedAt: T0,
      feed: successFeed([station({ name: "Joanico", connectors: [{ count: 2 }] })]),
    });
    await runIngestion(db, {
      observedAt: T1,
      feed: successFeed([station({ name: "Joanico", connectors: null })]),
    });

    const presence = await db.select().from(stationStates);
    expect(presence).toHaveLength(1);
    expect(presence[0].state).toBe("listed");
    expect(presence[0].endedAt).toBeNull();
  });

  it("resumes recording state changes once telemetry comes back", async () => {
    await runIngestion(db, {
      observedAt: T0,
      feed: successFeed([
        station({ name: "Joanico", connectors: [{ count: 2, statusDetail: "Disponible" }] }),
      ]),
    });
    await runIngestion(db, {
      observedAt: T1,
      feed: successFeed([station({ name: "Joanico", connectors: null })]),
    });
    await runIngestion(db, {
      observedAt: T2,
      feed: successFeed([
        station({ name: "Joanico", connectors: [{ count: 2, statusDetail: "Faulted", status: 4 }] }),
      ]),
    });

    const rows = await db.select().from(connectorStates);
    expect(rows).toHaveLength(2);

    const closed = rows.find((row) => row.endedAt !== null);
    const open = rows.find((row) => row.endedAt === null);
    expect(closed?.health).toBe("operational");
    expect(closed?.startedAt).toEqual(T0);
    expect(closed?.endedAt).toEqual(T2);
    expect(open?.health).toBe("faulted");
    expect(open?.startedAt).toEqual(T2);
  });

  it("records a failed poll without touching station state", async () => {
    await runIngestion(db, {
      observedAt: T0,
      feed: successFeed([station({ name: "Joanico" })]),
    });

    const result = await runIngestion(db, { observedAt: T1, feed: failedFeed() });

    expect(result.outcome).toBe("fetch_error");
    expect(result.errorMessage).toBe("connection refused");

    const presence = await db.select().from(stationStates);
    expect(presence).toHaveLength(1);
    expect(presence[0].state).toBe("listed");
    expect(presence[0].endedAt).toBeNull();

    const rows = await db.select().from(connectorStates);
    expect(rows).toHaveLength(1);
    expect(rows[0].endedAt).toBeNull();
  });

  it("matches a renamed station by coordinates instead of creating a duplicate", async () => {
    await runIngestion(db, {
      observedAt: T0,
      feed: successFeed([station({ name: "Old name", lat: -34.5, lng: -56.5 })]),
    });
    await runIngestion(db, {
      observedAt: T1,
      feed: successFeed([station({ name: "New name", lat: -34.5, lng: -56.5 })]),
    });

    const rows = await db.select().from(stations);
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("New name");
  });

  it("matches a relocated station by name instead of creating a duplicate", async () => {
    await runIngestion(db, {
      observedAt: T0,
      feed: successFeed([station({ name: "Same name", lat: -34.5, lng: -56.5 })]),
    });
    await runIngestion(db, {
      observedAt: T1,
      feed: successFeed([station({ name: "Same name", lat: -34.6, lng: -56.6 })]),
    });

    const rows = await db.select().from(stations);
    expect(rows).toHaveLength(1);
    expect(rows[0].latitude).toBeCloseTo(-34.6, 5);
    expect(rows[0].coordKey).toBe("-34.60000,-56.60000");
  });

  it.each([
    ["the new site first", 0],
    ["the new site second", 1],
  ])("keeps a station attached to its coordinates when a namesake appears, %s", async (_label, newSiteIndex) => {
    await runIngestion(db, {
      observedAt: T0,
      feed: successFeed([station({ name: "Joanico", lat: -34.9, lng: -56.15 })]),
    });
    const [original] = await db.select().from(stations);

    const namesakeAtNewCoordinates = station({ name: "Joanico", lat: -33.0, lng: -55.0 });
    const originalAtSameCoordinates = station({ name: "Joanico", lat: -34.9, lng: -56.15 });
    const payload =
      newSiteIndex === 0
        ? [namesakeAtNewCoordinates, originalAtSameCoordinates]
        : [originalAtSameCoordinates, namesakeAtNewCoordinates];

    await runIngestion(db, { observedAt: T1, feed: successFeed(payload) });

    const rows = await db.select().from(stations);
    expect(rows).toHaveLength(2);

    const kept = rows.find((row) => row.id === original.id);
    expect(kept?.coordKey).toBe("-34.90000,-56.15000");
    expect(kept?.firstSeenAt).toEqual(T0);

    const added = rows.find((row) => row.id !== original.id);
    expect(added?.coordKey).toBe("-33.00000,-55.00000");
    expect(added?.firstSeenAt).toEqual(T1);
  });

  it("leaves a station untouched when two namesakes relocate and neither matches its coordinates", async () => {
    await runIngestion(db, {
      observedAt: T0,
      feed: successFeed([station({ name: "Ancap", lat: -34.9, lng: -56.15 })]),
    });
    const [original] = await db.select().from(stations);

    await runIngestion(db, {
      observedAt: T1,
      feed: successFeed([
        station({ name: "Ancap", lat: -33.0, lng: -55.0 }),
        station({ name: "Ancap", lat: -32.0, lng: -54.0 }),
      ]),
    });

    const rows = await db.select().from(stations);
    expect(rows).toHaveLength(3);
    expect(rows.find((row) => row.id === original.id)?.coordKey).toBe("-34.90000,-56.15000");
  });

  it("normalises inconsistent department spellings to one canonical value", async () => {
    await runIngestion(db, {
      observedAt: T0,
      feed: successFeed([
        station({ name: "A", lat: -33.1, lng: -58.1, department: "Río negro" }),
        station({ name: "B", lat: -33.2, lng: -58.2, department: "Río Negro" }),
        station({ name: "C", lat: -34.4, lng: -57.8, department: "Colonia " }),
      ]),
    });

    const rows = await db.select().from(stations);
    const departments = rows.map((row) => row.department).sort();
    expect(departments).toEqual(["Colonia", "Río Negro", "Río Negro"]);
  });

  it("restores a delisted station when it returns to the feed", async () => {
    const anchor = station({ name: "Anchor", lat: -34.1, lng: -56.9 });
    const joanico = station({ name: "Joanico", connectors: [{ count: 2 }] });

    await runIngestion(db, { observedAt: T0, feed: successFeed([joanico, anchor]) });
    await runIngestion(db, { observedAt: T1, feed: successFeed([anchor]) });
    await runIngestion(db, { observedAt: T2, feed: successFeed([joanico, anchor]) });

    const presence = await db
      .select()
      .from(stationStates)
      .orderBy(stationStates.startedAt);
    const joanicoStates = presence.filter((row) => row.stationId === 1);
    expect(joanicoStates.map((row) => row.state)).toEqual(["listed", "delisted", "listed"]);
    expect(joanicoStates[2].endedAt).toBeNull();

    const current = (await db.select().from(connectorStates)).filter(
      (row) => row.endedAt === null && row.connectorGroupId === 1,
    );
    expect(current).toHaveLength(1);
    expect(current[0].health).toBe("operational");
    expect(current[0].connectorCount).toBe(2);
  });

  it("keeps every state when one connector bank is split across statuses", async () => {
    const result = await runIngestion(db, {
      observedAt: T0,
      feed: successFeed([
        station({
          name: "Split bank",
          connectors: [
            { count: 1, statusDetail: "Available", status: 0 },
            { count: 1, statusDetail: "Faulted", status: 4 },
          ],
        }),
      ]),
    });

    expect(result.connectorGroupsCreated).toBe(1);
    expect(result.connectorsInFeed).toBe(2);
    expect(result.connectorStateChanges).toBe(2);

    const rows = await db.select().from(connectorStates);
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.endedAt === null)).toBe(true);

    const byHealth = Object.fromEntries(rows.map((row) => [row.health, row.connectorCount]));
    expect(byHealth).toEqual({ operational: 1, faulted: 1 });
  });

  it("closes a state that stops being reported for a group", async () => {
    const split = successFeed([
      station({
        name: "Split bank",
        connectors: [
          { count: 1, statusDetail: "Available", status: 0 },
          { count: 1, statusDetail: "Faulted", status: 4 },
        ],
      }),
    ]);
    const recovered = successFeed([
      station({ name: "Split bank", connectors: [{ count: 2, statusDetail: "Available", status: 0 }] }),
    ]);

    await runIngestion(db, { observedAt: T0, feed: split });
    await runIngestion(db, { observedAt: T1, feed: recovered });

    const open = (await db.select().from(connectorStates)).filter((row) => row.endedAt === null);
    expect(open).toHaveLength(1);
    expect(open[0].health).toBe("operational");
    expect(open[0].connectorCount).toBe(2);

    const closed = (await db.select().from(connectorStates)).filter((row) => row.endedAt !== null);
    expect(closed).toHaveLength(2);
    expect(closed.every((row) => row.endedAt?.getTime() === T1.getTime())).toBe(true);
  });

  it("does not write anything twice for an unchanged split-status group", async () => {
    const split = successFeed([
      station({
        name: "Split bank",
        connectors: [
          { count: 1, statusDetail: "Available", status: 0 },
          { count: 1, statusDetail: "Faulted", status: 4 },
        ],
      }),
    ]);

    await runIngestion(db, { observedAt: T0, feed: split });
    const second = await runIngestion(db, { observedAt: T1, feed: split });

    expect(second.connectorStateChanges).toBe(0);
    expect(await db.select().from(connectorStates)).toHaveLength(2);
  });

  it("lets a station take over coordinates released by one that moved", async () => {
    await runIngestion(db, {
      observedAt: T0,
      feed: successFeed([station({ name: "Alpha", lat: -34.5, lng: -56.5 })]),
    });

    const result = await runIngestion(db, {
      observedAt: T1,
      feed: successFeed([
        station({ name: "Alpha", lat: -34.7, lng: -56.7 }),
        station({ name: "Beta", lat: -34.5, lng: -56.5 }),
      ]),
    });

    expect(result.outcome).toBe("success");
    expect(result.stationsCreated).toBe(1);

    const rows = await db.select().from(stations);
    expect(rows).toHaveLength(2);

    const byName = Object.fromEntries(rows.map((row) => [row.name, row.coordKey]));
    expect(byName).toEqual({
      Alpha: "-34.70000,-56.70000",
      Beta: "-34.50000,-56.50000",
    });
  });

  it("refuses to apply a feed whose station count collapses", async () => {
    const full = successFeed([
      station({ name: "One", lat: -34.1, lng: -56.1, connectors: [{ count: 2 }] }),
      station({ name: "Two", lat: -34.2, lng: -56.2, connectors: [{ count: 2 }] }),
      station({ name: "Three", lat: -34.3, lng: -56.3, connectors: [{ count: 2 }] }),
      station({ name: "Four", lat: -34.4, lng: -56.4, connectors: [{ count: 2 }] }),
    ]);
    await runIngestion(db, { observedAt: T0, feed: full });

    const result = await runIngestion(db, { observedAt: T1, feed: successFeed([]) });

    expect(result.outcome).toBe("implausible_payload");
    expect(result.stationStateChanges).toBe(0);
    expect(result.connectorStateChanges).toBe(0);

    const presence = await db.select().from(stationStates);
    expect(presence.every((row) => row.state === "listed" && row.endedAt === null)).toBe(true);

    const connectors = await db.select().from(connectorStates);
    expect(connectors.every((row) => row.health === "operational" && row.endedAt === null)).toBe(
      true,
    );
  });

  it("keeps accepting feeds while churn piles up station rows nothing prunes", async () => {
    const cohort = (offset: number) =>
      [1, 2, 3, 4].map((n) =>
        station({ name: `Site ${offset + n}`, lat: -34 - (offset + n) / 100, lng: -56.1 }),
      );

    const minutesApart = (n: number) => new Date(T0.getTime() + n * 15 * 60 * 1000);

    for (const [index, offset] of [0, 10, 20].entries()) {
      const poll = await runIngestion(db, {
        observedAt: minutesApart(index),
        feed: successFeed(cohort(offset)),
      });
      expect(poll.outcome).toBe("success");
    }

    const accumulated = await db.select().from(stations);
    expect(accumulated.length).toBe(12);

    const result = await runIngestion(db, {
      observedAt: minutesApart(3),
      feed: successFeed(cohort(30)),
    });

    expect(result.outcome).toBe("success");
    expect(result.stationsInFeed).toBe(4);
  });

  it("refuses a second halving measured against the peak, not against the last poll", async () => {

    await runIngestion(db, { observedAt: T0, feed: successFeed(FOUR_STATIONS) });
    const halved = await runIngestion(db, { observedAt: T1, feed: successFeed(FOUR_STATIONS.slice(0, 2)) });
    expect(halved.outcome).toBe("success");

    const delisted = await db
      .select()
      .from(stationStates)
      .where(and(eq(stationStates.state, "delisted"), isNull(stationStates.endedAt)));
    expect(delisted).toHaveLength(2);

    const again = await runIngestion(db, { observedAt: T2, feed: successFeed(FOUR_STATIONS.slice(0, 1)) });

    expect(again.outcome).toBe("implausible_payload");
    expect(again.errorMessage).toContain("against a recent peak of 4");
  });

  it("keeps refusing a collapse however long the feed reports it", async () => {
    const collapsed = successFeed(FOUR_STATIONS.slice(0, 1));

    await runIngestion(db, { observedAt: T0, feed: successFeed(FOUR_STATIONS) });

    for (const hoursLater of [1, 25, 49]) {
      const later = new Date(T0.getTime() + hoursLater * 60 * 60 * 1000);
      const refused = await runIngestion(db, { observedAt: later, feed: collapsed });
      expect(refused.outcome).toBe("implausible_payload");
    }

    const delisted = await db
      .select()
      .from(stationStates)
      .where(and(eq(stationStates.state, "delisted"), isNull(stationStates.endedAt)));
    expect(delisted).toHaveLength(0);
  });

  it("takes the count the network really has once the window holds no accepted poll", async () => {
    await runIngestion(db, { observedAt: T0, feed: successFeed(FOUR_STATIONS) });

    const halved = new Date(T0.getTime() + 25 * 60 * 60 * 1000);
    const stepDown = await runIngestion(db, {
      observedAt: halved,
      feed: successFeed(FOUR_STATIONS.slice(0, 2)),
    });
    expect(stepDown.outcome).toBe("success");

    const muchLater = new Date(T0.getTime() + 100 * 60 * 60 * 1000);
    const recovered = await runIngestion(db, {
      observedAt: muchLater,
      feed: successFeed(FOUR_STATIONS),
    });

    expect(recovered.outcome).toBe("success");
    expect(recovered.stationsInFeed).toBe(4);
  });

  it("guards a feed even when the audit trail holds no poll to compare against", async () => {
    await runIngestion(db, { observedAt: T0, feed: successFeed(FOUR_STATIONS) });
    await db.delete(pollRuns);

    const result = await runIngestion(db, {
      observedAt: T1,
      feed: successFeed(FOUR_STATIONS.slice(0, 1)),
    });

    expect(result.outcome).toBe("implausible_payload");
    expect(result.errorMessage).toContain("against the 4 currently listed");

    const delisted = await db
      .select()
      .from(stationStates)
      .where(and(eq(stationStates.state, "delisted"), isNull(stationStates.endedAt)));
    expect(delisted).toHaveLength(0);
  });

  it("keeps refusing a collapse that arrives after an outage rather than an insistence", async () => {
    await runIngestion(db, { observedAt: T0, feed: successFeed(FOUR_STATIONS) });

    for (let hour = 1; hour <= 25; hour += 1) {
      const during = new Date(T0.getTime() + hour * 60 * 60 * 1000);
      const outage = await runIngestion(db, { observedAt: during, feed: failedFeed() });
      expect(outage.outcome).toBe("fetch_error");
    }

    const afterTheOutage = new Date(T0.getTime() + 26 * 60 * 60 * 1000);
    const result = await runIngestion(db, {
      observedAt: afterTheOutage,
      feed: successFeed(FOUR_STATIONS.slice(0, 1)),
    });

    expect(result.outcome).toBe("implausible_payload");
    expect(result.errorMessage).toContain("against the 4 currently listed");

    const delisted = await db
      .select()
      .from(stationStates)
      .where(and(eq(stationStates.state, "delisted"), isNull(stationStates.endedAt)));
    expect(delisted).toHaveLength(0);
  });

  it("never takes its baseline from a poll it refused", async () => {
    await runIngestion(db, { observedAt: T0, feed: successFeed(FOUR_STATIONS) });

    await db.insert(pollRuns).values({
      startedAt: T1,
      durationMs: 100,
      outcome: "implausible_payload",
      stationCount: 100,
      connectorCount: 200,
    });

    const result = await runIngestion(db, { observedAt: T2, feed: successFeed(FOUR_STATIONS) });

    expect(result.outcome).toBe("success");
    expect(result.stationsInFeed).toBe(4);
  });

  it("applies a partial drop that stays within the plausible range", async () => {
    const full = successFeed([
      station({ name: "One", lat: -34.1, lng: -56.1 }),
      station({ name: "Two", lat: -34.2, lng: -56.2 }),
      station({ name: "Three", lat: -34.3, lng: -56.3 }),
      station({ name: "Four", lat: -34.4, lng: -56.4 }),
    ]);
    await runIngestion(db, { observedAt: T0, feed: full });

    const result = await runIngestion(db, {
      observedAt: T1,
      feed: successFeed([
        station({ name: "One", lat: -34.1, lng: -56.1 }),
        station({ name: "Two", lat: -34.2, lng: -56.2 }),
      ]),
    });

    expect(result.outcome).toBe("success");
    expect(result.stationStateChanges).toBe(2);
  });

  it("keeps a station that moves onto coordinates freed in the same poll", async () => {
    await runIngestion(db, {
      observedAt: T0,
      feed: successFeed([
        station({ name: "Alpha", lat: -34.5, lng: -56.5 }),
        station({ name: "Gamma", lat: -33.3, lng: -55.5 }),
      ]),
    });

    await runIngestion(db, {
      observedAt: T1,
      feed: successFeed([
        station({ name: "Alpha", lat: -34.7, lng: -56.7 }),
        station({ name: "Gamma", lat: -34.5, lng: -56.5 }),
      ]),
    });

    const rows = await db.select().from(stations);
    expect(rows).toHaveLength(2);

    const byName = Object.fromEntries(rows.map((row) => [row.name, row.coordKey]));
    expect(byName).toEqual({
      Alpha: "-34.70000,-56.70000",
      Gamma: "-34.50000,-56.50000",
    });

    const presence = await db.select().from(stationStates);
    expect(presence.every((row) => row.state === "listed")).toBe(true);
  });

  it("ignores duplicate coordinates within a single payload", async () => {
    const result = await runIngestion(db, {
      observedAt: T0,
      feed: successFeed([
        station({ name: "First", lat: -34.5, lng: -56.5 }),
        station({ name: "Duplicate", lat: -34.5, lng: -56.5 }),
      ]),
    });

    expect(result.duplicateStations).toBe(1);
    expect(result.stationsCreated).toBe(1);
  });
});
