import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { authorizeCronRequest } from "@/lib/api/cron-auth";
import { createWriteDatabase } from "@/lib/db/write-client";
import { pollRuns } from "@/lib/db/schema";
import { runIngestion } from "@/lib/ingest/pipeline";
import { fetchStationFeedV2 } from "@/lib/ute/v2-client";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MIN_SECONDS_BETWEEN_POLLS = 60;

function privateJson(payload: unknown, status: number): NextResponse {
  return NextResponse.json(payload, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

async function secondsSinceLastPoll(db: ReturnType<typeof createWriteDatabase>["db"]) {
  const [latest] = await db
    .select({ startedAt: pollRuns.startedAt })
    .from(pollRuns)
    .orderBy(desc(pollRuns.startedAt))
    .limit(1);

  if (!latest) return Number.POSITIVE_INFINITY;
  return (Date.now() - latest.startedAt.getTime()) / 1000;
}

async function handle(request: Request): Promise<NextResponse> {
  const authorization = authorizeCronRequest(request);

  if (authorization === "not-configured") {
    console.error("POST /api/poll rejected: CRON_SECRET is not set");
    return privateJson({ error: "Polling is not configured" }, 503);
  }

  if (authorization === "unauthorized") {
    return privateJson({ error: "Unauthorized" }, 401);
  }

  const { db, close } = createWriteDatabase();
  try {
    const elapsed = await secondsSinceLastPoll(db);
    if (elapsed < MIN_SECONDS_BETWEEN_POLLS) {
      return privateJson(
        { skipped: "A poll ran moments ago", secondsSinceLastPoll: Math.round(elapsed) },
        429,
      );
    }

    const result = await runIngestion(db, { feed: await fetchStationFeedV2() });
    if (result.outcome !== "success") {
      console.error(`POST /api/poll ingested nothing: ${result.errorMessage ?? result.outcome}`);
    }

    return privateJson(result, result.outcome === "success" ? 200 : 502);
  } catch (error) {
    console.error("POST /api/poll failed", error);
    return privateJson({ error: "Poll failed" }, 500);
  } finally {
    await close();
  }
}

export async function POST(request: Request) {
  return handle(request);
}

export async function GET(request: Request) {
  return handle(request);
}
