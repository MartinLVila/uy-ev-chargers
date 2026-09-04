import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import type { NextResponse } from "next/server";
import { rateLimitedResponse } from "./response";

const READ_REQUESTS_PER_MINUTE = 60;
const POLL_REQUESTS_PER_HOUR = 20;
const REDIS_TIMEOUT_MS = 1_000;
const DAYS_COVERED_BY_ONE_REQUEST_UNIT = 90;
const SHARED_BUCKET_FOR_UNIDENTIFIED_CLIENTS = "unidentified-client";

export type RateLimitScope = "read" | "poll";

const blockedIdentifiers = new Map<string, number>();

interface LimiterBuild {
  limiters: Record<RateLimitScope, Ratelimit> | null;
}

let build: LimiterBuild | null = null;

function redisCredentials(): { url: string; token: string } | null {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  return url && token ? { url, token } : null;
}

function buildLimiters(): Record<RateLimitScope, Ratelimit> | null {
  const connection = redisCredentials();
  if (!connection) {
    console.error("Rate limiting is disabled: KV_REST_API_URL or KV_REST_API_TOKEN is not set");
    return null;
  }

  const redis = new Redis(connection);

  return {
    read: new Ratelimit({
      redis,
      prefix: "evmap:read",
      limiter: Ratelimit.slidingWindow(READ_REQUESTS_PER_MINUTE, "60 s"),
      ephemeralCache: blockedIdentifiers,
      timeout: REDIS_TIMEOUT_MS,
    }),
    poll: new Ratelimit({
      redis,
      prefix: "evmap:poll",
      limiter: Ratelimit.slidingWindow(POLL_REQUESTS_PER_HOUR, "1 h"),
      ephemeralCache: blockedIdentifiers,
      timeout: REDIS_TIMEOUT_MS,
      enableProtection: true,
    }),
  };
}

function limiterFor(scope: RateLimitScope): Ratelimit | null {
  build ??= { limiters: buildLimiters() };
  return build.limiters?.[scope] ?? null;
}

export function clientIdentifier(request: Request): string {
  const platformIp = request.headers.get("x-real-ip")?.trim();
  if (platformIp) return platformIp;

  const forwarded =
    request.headers.get("x-vercel-forwarded-for") ?? request.headers.get("x-forwarded-for");
  const hops = (forwarded ?? "")
    .split(",")
    .map((hop) => hop.trim())
    .filter(Boolean);
  const appendedByTheClosestProxy = hops[hops.length - 1];

  return appendedByTheClosestProxy ?? SHARED_BUCKET_FOR_UNIDENTIFIED_CLIENTS;
}

export function requestUnitsForWindow(days: number): number {
  if (!Number.isFinite(days) || days <= 0) return 1;
  return Math.ceil(days / DAYS_COVERED_BY_ONE_REQUEST_UNIT);
}

function secondsUntilReset(reset: number): number {
  return Math.max(1, Math.ceil((reset - Date.now()) / 1000));
}

export async function rejectIfRateLimited(
  request: Request,
  scope: RateLimitScope,
  requestUnits = 1,
): Promise<NextResponse | null> {
  const limiter = limiterFor(scope);
  if (!limiter) return null;

  const identifier = clientIdentifier(request);

  try {
    const decision = await limiter.limit(identifier, {
      rate: requestUnits,
      ip: identifier,
      userAgent: request.headers.get("user-agent") ?? undefined,
    });

    if (decision.success) return null;
    return rateLimitedResponse(secondsUntilReset(decision.reset));
  } catch (error) {
    console.error(`Rate limiter unavailable for scope ${scope}; letting the request through`, error);
    return null;
  }
}
