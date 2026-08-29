import { NextResponse } from "next/server";

const CACHE_CONTROL = "public, s-maxage=60, stale-while-revalidate=600";

export function jsonResponse<T>(payload: T, init?: ResponseInit): NextResponse {
  return NextResponse.json(payload, {
    ...init,
    headers: {
      "cache-control": CACHE_CONTROL,
      "access-control-allow-origin": "*",
      ...init?.headers,
    },
  });
}

export function errorResponse(message: string, status: number): NextResponse {
  return jsonResponse({ error: message }, { status, headers: { "cache-control": "no-store" } });
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
