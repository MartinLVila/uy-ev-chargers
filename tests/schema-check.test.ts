import { sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { checkSchema, columnsTheCodeExpects, describeFaults } from "../src/lib/db/schema-check";
import { createTestDatabase, type TestDatabase } from "./helpers/database";
import type { SqlRunner } from "../src/lib/metrics/queries";

describe("the migrations produce the schema the code expects", () => {
  let db: TestDatabase;
  let close: () => Promise<void>;

  function check() {
    return checkSchema(db as unknown as SqlRunner);
  }

  beforeEach(async () => {
    ({ db, close } = await createTestDatabase());
  });

  afterEach(async () => {
    await close();
  });

  it("has a migration behind every column the code reads", async () => {
    const result = await check();

    expect(describeFaults(result.faults), "a schema change landed without its migration").toBe("");
    expect(result.matches).toBe(true);
  });

  it("looks at every table, not an empty list that would pass regardless", () => {
    const expected = columnsTheCodeExpects();
    const tables = new Set(expected.map((column) => column.table));

    expect(tables).toContain("connector_states");
    expect(tables).toContain("stations");
    expect(tables.size).toBeGreaterThanOrEqual(6);
    expect(expected).toContainEqual({
      table: "connector_states",
      column: "status_detail_key",
      notNull: true,
      generated: true,
    });
  });

  it("names the column a deploy outran, rather than only failing", async () => {
    await db.execute(sql`ALTER TABLE connector_states DROP COLUMN status_detail_key`);

    const result = await check();

    expect(result.matches).toBe(false);
    expect(describeFaults(result.faults)).toBe("connector_states.status_detail_key (absent)");
  });

  it("refuses a column that exists but that nothing will ever fill", async () => {
    await db.execute(sql`ALTER TABLE connector_states DROP COLUMN status_detail_key`);
    await db.execute(sql`ALTER TABLE connector_states ADD COLUMN status_detail_key text`);

    const result = await check();

    expect(result.matches, "a plain column stood in for a generated one").toBe(false);
    expect(result.faults).toContainEqual({
      table: "connector_states",
      column: "status_detail_key",
      problem: "not generated",
    });
  });

  it("refuses a column the database will let go null where the code will not", async () => {
    await db.execute(sql`ALTER TABLE stations ALTER COLUMN slug DROP NOT NULL`);

    const result = await check();

    expect(result.matches).toBe(false);
    expect(result.faults).toContainEqual({
      table: "stations",
      column: "slug",
      problem: "nullable",
    });
  });

  it("does not mind the database knowing more than the code does", async () => {
    await db.execute(sql`ALTER TABLE stations ADD COLUMN something_later text`);

    expect((await check()).matches).toBe(true);
  });
});
