import { is, sql } from "drizzle-orm";
import { PgTable, getTableConfig } from "drizzle-orm/pg-core";
import type { SqlRunner } from "../metrics/queries";
import * as schema from "./schema";

export interface MissingColumn {
  table: string;
  column: string;
}

export interface SchemaCheck {
  matches: boolean;
  missing: MissingColumn[];
}

export function columnsTheCodeExpects(): MissingColumn[] {
  return (Object.values(schema) as unknown[])
    .filter((exported): exported is PgTable => is(exported, PgTable))
    .flatMap((table) => {
      const { name, columns } = getTableConfig(table);
      return columns.map((column) => ({ table: name, column: column.name }));
    });
}

export async function checkSchema(db: SqlRunner): Promise<SchemaCheck> {
  const { rows } = await db.execute<{ table_name: string; column_name: string }>(sql`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
  `);

  const present = new Set(rows.map((row) => `${row.table_name}.${row.column_name}`));
  const missing = columnsTheCodeExpects().filter(
    (expected) => !present.has(`${expected.table}.${expected.column}`),
  );

  return { matches: missing.length === 0, missing };
}

export function describeMissing(missing: MissingColumn[]): string {
  return missing.map(({ table, column }) => `${table}.${column}`).join(", ");
}
