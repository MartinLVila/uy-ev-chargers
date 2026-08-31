import { NextResponse } from "next/server";

const NOT_FOR_A_SHARED_CACHE = "private, no-store";
const NEVER_STORED = "no-store";
const THE_CREDENTIAL_THAT_DECIDES_THE_BODY = "authorization";

function tokenGatedHeaders(): Record<string, string> {
  return {
    "cache-control": NOT_FOR_A_SHARED_CACHE,
    "cdn-cache-control": NEVER_STORED,
    "vercel-cdn-cache-control": NEVER_STORED,
    vary: THE_CREDENTIAL_THAT_DECIDES_THE_BODY,
  };
}

export function tokenGatedJsonResponse<T>(payload: T, init?: ResponseInit): NextResponse {
  const headers = new Headers(init?.headers);
  for (const [name, value] of Object.entries(tokenGatedHeaders())) headers.set(name, value);
  return NextResponse.json(payload, { ...init, headers });
}

export function errorResponse(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message }, { status, headers: tokenGatedHeaders() });
}

export function rateLimitedResponse(retryAfterSeconds: number): NextResponse {
  return NextResponse.json(
    { error: "Too many requests" },
    {
      status: 429,
      headers: { ...tokenGatedHeaders(), "retry-after": String(retryAfterSeconds) },
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
