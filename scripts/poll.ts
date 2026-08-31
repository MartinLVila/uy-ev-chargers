import "./env";
import { createWriteDatabase } from "../src/lib/db/write-client";
import { startIngestion, type IngestionAttempt } from "../src/lib/ingest/entry-point";

function report(attempt: IngestionAttempt): boolean {
  if (attempt.status === "already-running") {
    process.stdout.write("Another poll is already running; skipping.\n");
    return true;
  }

  if (attempt.status === "polled-recently") {
    process.stdout.write(`A poll succeeded ${attempt.secondsSinceLastSuccess}s ago; skipping.\n`);
    return true;
  }

  process.stdout.write(`${JSON.stringify(attempt.result)}\n`);
  return attempt.result.outcome === "success";
}

async function main() {
  const { db, close } = createWriteDatabase();
  try {
    const attempt = await startIngestion(db);
    if (!report(attempt)) {
      const reason = attempt.status === "ingested" ? attempt.result.outcome : attempt.status;
      process.stderr.write(`Feed unavailable: ${reason}\n`);
      process.exitCode = 1;
    }
  } finally {
    await close();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`Poll failed: ${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
