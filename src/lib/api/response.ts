import { NextResponse } from "next/server";

const BROWSER_CACHE_CONTROL = "public, max-age=0, must-revalidate";
const EDGE_CACHE_CONTROL = "public, s-maxage=60, stale-while-revalidate=600";
const NEVER_STORED = "no-store";
const PUBLIC_READ_ORIGIN = "*";

function cacheableHeaders(): Record<string, string> {
  return {
    "cache-control": BROWSER_CACHE_CONTROL,
    "cdn-cache-control": EDGE_CACHE_CONTROL,
    "vercel-cdn-cache-control": EDGE_CACHE_CONTROL,
    "access-control-allow-origin": PUBLIC_READ_ORIGIN,
  };
}

function uncacheableHeaders(): Record<string, string> {
  return {
    "cache-control": NEVER_STORED,
    "cdn-cache-control": NEVER_STORED,
    "vercel-cdn-cache-control": NEVER_STORED,
    "access-control-allow-origin": PUBLIC_READ_ORIGIN,
  };
}

export function jsonResponse<T>(payload: T, init?: ResponseInit): NextResponse {
  return NextResponse.json(payload, {
    ...init,
    headers: { ...cacheableHeaders(), ...init?.headers },
  });
}

export function errorResponse(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message }, { status, headers: uncacheableHeaders() });
}

export function rateLimitedResponse(retryAfterSeconds: number): NextResponse {
  return NextResponse.json(
    { error: "Too many requests" },
    {
      status: 429,
      headers: { ...uncacheableHeaders(), "retry-after": String(retryAfterSeconds) },
    },
  );
}

export function loggedErrorResponse(
  scope: string,
  error: unknown,
  clientMessage: string,
  status = 503,
): NextResponse {
  console.error(`${scope} failed`, error);
  return errorResponse(clientMessage, status);
}
