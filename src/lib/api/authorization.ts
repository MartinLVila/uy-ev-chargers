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

  if (authorization === "unauthorized") return errorResponse("Unauthorized", 401);

  return null;
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
