import { readdirSync, readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { connectorStates } from "../src/lib/db/schema";
import { runIngestion } from "../src/lib/ingest/pipeline";
import { getUsageBreakdown, type SqlRunner } from "../src/lib/metrics/queries";
import { connectorUsageState } from "../src/lib/ui/health";
import { statusDetailKey } from "../src/lib/ute/status";
import { createTestDatabase, type TestDatabase } from "./helpers/database";
import { station, successFeed } from "./helpers/feed";

const WINDOW = { from: new Date("2026-03-10T00:00:00Z"), to: new Date("2026-03-11T00:00:00Z") };
const HOUR_MS = 60 * 60 * 1000;

const NO_BREAK_SPACE = " ";
const THIN_SPACE = " ";
const IDEOGRAPHIC_SPACE = "　";

const AWKWARD_DETAILS = [
  "Disponible",
  "disponible",
  "  Disponible  ",
  "Disponíble",
  "DISPONIBLE",
  "Dis  ponible",
  `Disponible${NO_BREAK_SPACE}`,
  `${NO_BREAK_SPACE}Disponible`,
  `Disponible${THIN_SPACE}`,
  `Dis${IDEOGRAPHIC_SPACE}ponible`,
  "Disponible\n",
  "Disponible\t",
  "Available",
  "AVAILABLE",
  "Charging",
  "Fuera de servicio",
  "Sin comunicación",
  "No  Disponible",
];

describe("free versus in use is decided the same way everywhere", () => {
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

  async function inUseHoursFor(statusDetail: string): Promise<number> {
    await db.delete(connectorStates);
    await db.insert(connectorStates).values({
      connectorGroupId: groupId,
      statusDetail,
      health: "operational",
      connectorCount: 1,
      startedAt: new Date(WINDOW.from.getTime()),
      endedAt: new Date(WINDOW.from.getTime() + HOUR_MS),
    });
    return (await getUsageBreakdown(runner, WINDOW)).connectorHours.inUse;
  }

  for (const statusDetail of AWKWARD_DETAILS) {
    it(`agrees between SQL and TypeScript for ${JSON.stringify(statusDetail)}`, async () => {
      const sqlSaysInUse = (await inUseHoursFor(statusDetail)) > 0;
      const typescriptSaysInUse = connectorUsageState("operational", statusDetail) === "inUse";

      expect(sqlSaysInUse).toBe(typescriptSaysInUse);
    });
  }

  it("computes the same key in the database as fold does in TypeScript", async () => {
    await db.delete(connectorStates);
    await db.insert(connectorStates).values(
      AWKWARD_DETAILS.map((statusDetail, index) => ({
        connectorGroupId: groupId,
        statusDetail,
        health: "operational",
        connectorCount: 1,
        startedAt: new Date(WINDOW.from.getTime() + index * HOUR_MS),
        endedAt: new Date(WINDOW.from.getTime() + (index + 1) * HOUR_MS),
      })),
    );

    const rows = await db.query.connectorStates.findMany();
    expect(rows).toHaveLength(AWKWARD_DETAILS.length);

    for (const row of rows) {
      expect(
        row.statusDetailKey,
        `the database disagreed with fold for ${JSON.stringify(row.statusDetail)}`,
      ).toBe(statusDetailKey(row.statusDetail));
    }
  });

  it("treats an accented spelling of disponible as free, not as in use", async () => {
    expect(await inUseHoursFor("Disponíble")).toBe(0);
    expect(connectorUsageState("operational", "Disponíble")).toBe("free");
  });

  it("treats a non-breaking space around the word as free, not as in use", async () => {
    expect(await inUseHoursFor(`${NO_BREAK_SPACE}Disponible${NO_BREAK_SPACE}`)).toBe(0);
  });

  it("treats a doubly-spaced spelling as free, not as in use", async () => {
    expect(await inUseHoursFor("  Disponible  ")).toBe(0);
  });

  it("does not silently merge a word split by a space into the free spelling", async () => {
    expect(await inUseHoursFor("Dis ponible")).toBeGreaterThan(0);
    expect(connectorUsageState("operational", "Dis ponible")).toBe("inUse");
  });

  it("still counts a genuinely busy connector as in use", async () => {
    expect(await inUseHoursFor("Charging")).toBeGreaterThan(0);
  });

  it("keeps the key for rows written before it existed, without any caller supplying it", async () => {
    await db.delete(connectorStates);
    await runIngestion(db, {
      observedAt: new Date("2026-03-10T00:00:00Z"),
      feed: successFeed([
        station({
          name: "Solo",
          lat: -34.9,
          lng: -56.1,
          connectors: [{ count: 1, statusDetail: `  Disponíble${NO_BREAK_SPACE}` }],
        }),
      ]),
    });

    const [row] = await db.query.connectorStates.findMany();
    expect(row.statusDetail).toBe("Disponíble");
    expect(row.statusDetailKey).toBe("disponible");
  });
});

describe("the key is derived in one place", () => {
  const EXPRESSION_START = "btrim(regexp_replace(lower(";

  function derivation(source: string): string | null {
    const start = source.indexOf(EXPRESSION_START);
    if (start === -1) return null;

    const stopsAt = source.indexOf("STORED", start);
    const raw = stopsAt === -1 ? source.slice(start, source.indexOf("`", start)) : source.slice(start, stopsAt);

    return raw.split('"status_detail"').join("status_detail").replace(/\s+/g, " ").replace(/[)\s]+$/, "");
  }

  it("declares the same derivation in the schema and in the migration that creates it", () => {
    const fromSchema = derivation(readFileSync("src/lib/db/schema.ts", "utf8"));
    const fromMigrations = readdirSync("drizzle")
      .filter((name) => name.endsWith(".sql"))
      .map((name) => derivation(readFileSync(`drizzle/${name}`, "utf8")))
      .filter((expression): expression is string => expression !== null);

    expect(fromSchema, "the schema no longer derives the key").not.toBeNull();
    expect(fromMigrations, "no migration creates the generated column").toHaveLength(1);
    expect(fromMigrations[0]).toBe(fromSchema);
  });
});

describe("the migration folder is internally consistent", () => {
  it("has a file on disk for every entry the journal will try to run", () => {
    const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8")) as {
      entries: Array<{ idx: number; tag: string }>;
    };
    const onDisk = readdirSync("drizzle").filter((name) => name.endsWith(".sql"));

    for (const entry of journal.entries) {
      expect(onDisk, `the journal names ${entry.tag} but no file exists`).toContain(
        `${entry.tag}.sql`,
      );
    }
    expect(journal.entries).toHaveLength(onDisk.length);
    expect(journal.entries.map((entry) => entry.idx)).toEqual(
      journal.entries.map((_, index) => index),
    );
  });

  it("leaves no migration declaring an empty generated expression", () => {
    for (const name of readdirSync("drizzle").filter((file) => file.endsWith(".sql"))) {
      expect(
        readFileSync(`drizzle/${name}`, "utf8"),
        `${name} declares a generated column with no expression`,
      ).not.toContain("GENERATED ALWAYS AS () STORED");
    }
  });
});
