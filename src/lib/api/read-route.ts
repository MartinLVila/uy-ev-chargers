import type { NextResponse } from "next/server";
import { getDb, type ReadDatabase } from "@/lib/db/client";
import { parseWindowDays, windowFromDays, type TimeWindow } from "@/lib/metrics/window";
import { rejectUnauthorizedRead } from "./authorization";
import { rejectIfRateLimited, requestUnitsForWindow } from "./rate-limit";
import { loggedErrorResponse } from "./response";

export interface ReadRequest {
  request: Request;
  db: ReadDatabase;
}

export interface WindowedReadRequest<Params> extends ReadRequest {
  days: number;
  window: TimeWindow;
  params: Params;
}

type RouteParams = Record<string, string | string[]>;

interface RouteContext<Params> {
  params: Promise<Params>;
}

type Answer<Read> = (read: Read) => Promise<NextResponse>;

export function readRoute(unavailableMessage: string, answer: Answer<ReadRequest>) {
  return async function respond(request: Request): Promise<NextResponse> {
    return metered(request, {}, 1, unavailableMessage, (db) => answer({ request, db }));
  };
}

export function windowedReadRoute<Params = object>(
  unavailableMessage: string,
  answer: Answer<WindowedReadRequest<Params>>,
) {
  return async function respond(
    request: Request,
    context?: RouteContext<Params>,
  ): Promise<NextResponse> {
    const days = parseWindowDays(new URL(request.url).searchParams.get("days"));
    const params = ((await context?.params) ?? {}) as Params;

    return metered(
      request,
      params as RouteParams,
      requestUnitsForWindow(days),
      unavailableMessage,
      (db) => answer({ request, db, days, window: windowFromDays(days), params }),
    );
  };
}

async function metered(
  request: Request,
  params: RouteParams,
  units: number,
  unavailableMessage: string,
  answer: (db: ReadDatabase) => Promise<NextResponse>,
): Promise<NextResponse> {
  const limited = await rejectIfRateLimited(request, "read", units);
  if (limited) return limited;

  const unauthorized = rejectUnauthorizedRead(request);
  if (unauthorized) return unauthorized;

  try {
    return await answer(getDb());
  } catch (error) {
    return loggedErrorResponse(routeScope(request, params), error, unavailableMessage);
  }
}

function routeScope(request: Request, params: RouteParams): string {
  const path = Object.entries(params).reduce(
    (pattern, [name, value]) => replaceSegments(pattern, value, name),
    new URL(request.url).pathname,
  );
  return `${request.method} ${path}`;
}

function replaceSegments(pattern: string, value: string | string[], name: string): string {
  const matched = Array.isArray(value) ? value.join("/") : value;
  return [matched, encodeURIComponent(matched)].reduce(
    (path, spelling) => path.replace(`/${spelling}`, `/[${name}]`),
    pattern,
  );
}
