import { timingSafeEqual } from "node:crypto";
import type { NextResponse } from "next/server";
import { errorResponse } from "./response";

export type BearerAuthResult = "authorized" | "unauthorized" | "not-configured";

export function authorizeCronRequest(request: Request): BearerAuthResult {
  return authorizeBearer(request, process.env.CRON_SECRET);
}

export function authorizeReadRequest(request: Request): BearerAuthResult {
  return authorizeBearer(request, process.env.API_READ_TOKEN);
}

export function rejectUnauthorizedRead(request: Request): NextResponse | null {
  const authorization = authorizeReadRequest(request);

  if (authorization === "not-configured") {
    console.error("API_READ_TOKEN is not set; refusing the request rather than answering openly");
    return errorResponse("The API is not available", 503);
  }

  if (authorization === "unauthorized") {
    const attempt = rejectedCredential(request);
    if (attempt) console.warn(`Rejected an unauthorized read: ${attempt}`);
    return errorResponse("Unauthorized", 401);
  }

  return null;
}

function rejectedCredential(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header) return null;

  const [scheme] = header.split(" ");
  if (scheme.toLowerCase() !== "bearer") return "the authorization header was not a bearer token";

  return bearerToken(header) === null
    ? "a bearer token was sent with no value"
    : "a bearer token was sent and did not match";
}

function authorizeBearer(request: Request, expected: string | undefined): BearerAuthResult {
  if (!expected) return "not-configured";

  const presented = bearerToken(request.headers.get("authorization"));
  if (presented === null) return "unauthorized";

  return equalsInConstantTime(presented, expected) ? "authorized" : "unauthorized";
}

function bearerToken(header: string | null): string | null {
  if (!header) return null;
  const [scheme, ...rest] = header.split(" ");
  if (scheme.toLowerCase() !== "bearer") return null;
  const token = rest.join(" ").trim();
  return token.length > 0 ? token : null;
}

function equalsInConstantTime(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) {
    timingSafeEqual(left, left);
    return false;
  }
  return timingSafeEqual(left, right);
}
