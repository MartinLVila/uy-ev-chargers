import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";

export type ReadDatabase = ReturnType<typeof createReadDatabase>;

export type WriteDatabase = PgDatabase<PgQueryResultHKT, typeof schema>;

export function connectionString(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }
  return url;
}

function createReadDatabase() {
  return drizzle(neon(connectionString()), { schema });
}

let readDatabase: ReadDatabase | undefined;

export function getDb(): ReadDatabase {
  readDatabase ??= createReadDatabase();
  return readDatabase;
}
