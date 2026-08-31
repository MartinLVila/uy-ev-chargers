import type { NextResponse } from "next/server";
import { authorizeCronRequest } from "@/lib/api/authorization";
import { tokenGatedJsonResponse } from "@/lib/api/response";
import { rejectIfRateLimited } from "@/lib/api/rate-limit";
import { createWriteDatabase } from "@/lib/db/write-client";
import { startIngestion, type IngestionAttempt } from "@/lib/ingest/entry-point";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function privateJson(payload: unknown, status: number): NextResponse {
  return tokenGatedJsonResponse(payload, { status });
}

function reportAttempt(attempt: IngestionAttempt, scope: string): NextResponse {
  if (attempt.status === "already-running") {
    return privateJson({ skipped: "Another poll is already running" }, 409);
  }

  if (attempt.status === "polled-recently") {
    return privateJson(
      {
        skipped: "A poll succeeded moments ago",
        secondsSinceLastSuccess: attempt.secondsSinceLastSuccess,
      },
      429,
    );
  }

  const { result } = attempt;
  if (result.outcome !== "success") {
    console.error(`${scope} ingested nothing: ${result.errorMessage ?? result.outcome}`);
    return privateJson(result, 502);
  }

  return privateJson(result, 200);
}

async function handle(request: Request): Promise<NextResponse> {
  const scope = `${request.method} /api/poll`;

  const limited = await rejectIfRateLimited(request, "poll");
  if (limited) return limited;

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
    return reportAttempt(await startIngestion(db), scope);
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
