import { desc, eq } from "drizzle-orm";
import { pollRuns } from "../db/schema";
import { withIngestionLock, type WriteDb } from "../db/write-client";
import { fetchStationFeedV2 } from "../ute/v2-client";
import { runIngestion, type IngestResult } from "./pipeline";
import type { FeedResult } from "../ute/types";

export const MIN_SECONDS_BETWEEN_SUCCESSFUL_POLLS = 60;

export type IngestionAttempt =
  | { status: "ingested"; result: IngestResult }
  | { status: "already-running" }
  | { status: "polled-recently"; secondsSinceLastSuccess: number };

async function secondsSinceLastSuccess(db: WriteDb): Promise<number> {
  const [latest] = await db
    .select({ startedAt: pollRuns.startedAt })
    .from(pollRuns)
    .where(eq(pollRuns.outcome, "success"))
    .orderBy(desc(pollRuns.startedAt))
    .limit(1);

  if (!latest) return Number.POSITIVE_INFINITY;
  return (Date.now() - latest.startedAt.getTime()) / 1000;
}

export async function startIngestion(
  db: WriteDb,
  fetchFeed: () => Promise<FeedResult> = fetchStationFeedV2,
): Promise<IngestionAttempt> {
  return withIngestionLock<IngestionAttempt>(
    db,
    async () => {
      const elapsed = await secondsSinceLastSuccess(db);
      if (elapsed < MIN_SECONDS_BETWEEN_SUCCESSFUL_POLLS) {
        return { status: "polled-recently", secondsSinceLastSuccess: Math.round(elapsed) };
      }

      return { status: "ingested", result: await runIngestion(db, { feed: await fetchFeed() }) };
    },
    () => ({ status: "already-running" }),
  );
}
