import { neonConfig, Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";
import { connectionString } from "./client";
import * as schema from "./schema";

neonConfig.webSocketConstructor = ws;

export function createWriteDatabase() {
  const pool = new Pool({ connectionString: connectionString() });
  return {
    db: drizzle(pool, { schema }),
    close: () => pool.end(),
  };
}
