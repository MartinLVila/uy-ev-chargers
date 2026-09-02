import { sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { checkSchema, columnsTheCodeExpects, describeMissing } from "../src/lib/db/schema-check";
import { createTestDatabase, type TestDatabase } from "./helpers/database";
import type { SqlRunner } from "../src/lib/metrics/queries";

describe("the migrations produce the schema the code expects", () => {
  let db: TestDatabase;
  let close: () => Promise<void>;

  beforeEach(async () => {
    ({ db, close } = await createTestDatabase());
  });

  afterEach(async () => {
    await close();
  });

  it("has a migration behind every column the code reads", async () => {
    const check = await checkSchema(db as unknown as SqlRunner);

    expect(describeMissing(check.missing), "a schema change landed without its migration").toBe("");
    expect(check.matches).toBe(true);
  });

  it("looks at every table, not an empty list that would pass regardless", () => {
    const expected = columnsTheCodeExpects();
    const tables = new Set(expected.map((column) => column.table));

    expect(tables).toContain("connector_states");
    expect(tables).toContain("stations");
    expect(tables.size).toBeGreaterThanOrEqual(6);
    expect(expected).toContainEqual({ table: "connector_states", column: "status_detail_key" });
  });

  it("names the column a deploy outran, rather than only failing", async () => {
    await db.execute(sql`ALTER TABLE connector_states DROP COLUMN status_detail_key`);

    const check = await checkSchema(db as unknown as SqlRunner);

    expect(check.matches).toBe(false);
    expect(describeMissing(check.missing)).toBe("connector_states.status_detail_key");
  });

  it("does not mind the database knowing more than the code does", async () => {
    await db.execute(sql`ALTER TABLE stations ADD COLUMN something_later text`);

    expect((await checkSchema(db as unknown as SqlRunner)).matches).toBe(true);
  });
});
