import { is, sql } from "drizzle-orm";
import { PgTable, getTableConfig } from "drizzle-orm/pg-core";
import type { SqlRunner } from "../metrics/queries";
import * as schema from "./schema";

export type SchemaProblem = "absent" | "nullable" | "not generated";

export interface SchemaFault {
  table: string;
  column: string;
  problem: SchemaProblem;
}

export interface ExpectedColumn {
  table: string;
  column: string;
  notNull: boolean;
  generated: boolean;
}

export interface SchemaCheck {
  matches: boolean;
  faults: SchemaFault[];
}

interface PresentColumn {
  notNull: boolean;
  generated: boolean;
}

export function columnsTheCodeExpects(): ExpectedColumn[] {
  return (Object.values(schema) as unknown[])
    .filter((exported): exported is PgTable => is(exported, PgTable))
    .flatMap((table) => {
      const { name, columns } = getTableConfig(table);
      return columns.map((column) => ({
        table: name,
        column: column.name,
        notNull: column.notNull,
        generated: column.generated !== undefined,
      }));
    });
}

export async function checkSchema(db: SqlRunner): Promise<SchemaCheck> {
  const { rows } = await db.execute<{
    table_name: string;
    column_name: string;
    not_null: boolean;
    generated: boolean;
  }>(sql`
    SELECT
      c.relname AS table_name,
      a.attname AS column_name,
      a.attnotnull AS not_null,
      a.attgenerated <> '' AS generated
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND a.attnum > 0
      AND NOT a.attisdropped
  `);

  const present = new Map<string, PresentColumn>(
    rows.map((row) => [
      `${row.table_name}.${row.column_name}`,
      { notNull: row.not_null, generated: row.generated },
    ]),
  );

  const faults = columnsTheCodeExpects().flatMap((expected) => {
    const found = present.get(`${expected.table}.${expected.column}`);
    const fault = (problem: SchemaProblem): SchemaFault => ({
      table: expected.table,
      column: expected.column,
      problem,
    });

    if (!found) return [fault("absent")];

    const faults: SchemaFault[] = [];
    if (expected.notNull && !found.notNull) faults.push(fault("nullable"));
    if (expected.generated && !found.generated) faults.push(fault("not generated"));
    return faults;
  });

  return { matches: faults.length === 0, faults };
}

export function describeFaults(faults: SchemaFault[]): string {
  return faults.map(({ table, column, problem }) => `${table}.${column} (${problem})`).join(", ");
}
