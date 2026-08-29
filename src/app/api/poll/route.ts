import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { authorizeCronRequest } from "@/lib/api/cron-auth";
import { createWriteDatabase, withIngestionLock } from "@/lib/db/write-client";
import { pollRuns } from "@/lib/db/schema";
import { runIngestion } from "@/lib/ingest/pipeline";
import { fetchStationFeedV2 } from "@/lib/ute/v2-client";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MIN_SECONDS_BETWEEN_SUCCESSFUL_POLLS = 60;

import type { WriteDb } from "@/lib/db/write-client";

function privateJson(payload: unknown, status: number): NextResponse {
  return NextResponse.json(payload, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

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

async function ingest(db: WriteDb, scope: string): Promise<NextResponse> {
  const elapsed = await secondsSinceLastSuccess(db);
  if (elapsed < MIN_SECONDS_BETWEEN_SUCCESSFUL_POLLS) {
    return privateJson(
      { skipped: "A poll succeeded moments ago", secondsSinceLastSuccess: Math.round(elapsed) },
      429,
    );
  }

  const result = await runIngestion(db, { feed: await fetchStationFeedV2() });
  if (result.outcome !== "success") {
    console.error(`${scope} ingested nothing: ${result.errorMessage ?? result.outcome}`);
    return privateJson(result, 502);
  }

  return privateJson(result, 200);
}

async function handle(request: Request): Promise<NextResponse> {
  const scope = `${request.method} /api/poll`;
  const authorization = authorizeCronRequest(request);

  if (authorization === "not-configured") {
    console.error(`${scope} rejected: CRON_SECRET is not set`);
    return privateJson({ error: "Polling is not configured" }, 503);
  }

  if (authorization === "unauthorized") {
    return privateJson({ error: "Unauthorized" }, 401);
  }

  const { db, close } = createWriteDatabase();
  try {
    return await withIngestionLock(
      db,
      () => ingest(db, scope),
      () => privateJson({ skipped: "Another poll is already running" }, 409),
    );
  } catch (error) {
    console.error(`${scope} failed`, error);
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
