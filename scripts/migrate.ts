import "./env";
import { migrate } from "drizzle-orm/neon-serverless/migrator";
import { createWriteDatabase } from "../src/lib/db/write-client";

async function main() {
  const { db, close } = createWriteDatabase();
  try {
    await migrate(db, { migrationsFolder: "drizzle" });
    process.stdout.write("Migrations applied\n");
  } finally {
    await close();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`Migration failed: ${error instanceof Error ? error.message : error}\n`);
  process.exitCode = 1;
});
