import "./env";
import { createWriteDatabase } from "../src/lib/db/write-client";
import { runIngestion } from "../src/lib/ingest/pipeline";
import { fetchStationFeedV2 } from "../src/lib/ute/v2-client";

async function main() {
  const { db, close } = createWriteDatabase();
  try {
    const result = await runIngestion(db, { feed: await fetchStationFeedV2() });
    process.stdout.write(`${JSON.stringify(result)}\n`);

    if (result.outcome !== "success") {
      process.stderr.write(`Feed unavailable: ${result.errorMessage ?? "unknown error"}\n`);
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
