import { createHash } from "node:crypto";
import {
  stationFeedEnvelopeSchema,
  stationPayloadSchema,
  type StationPayload,
} from "./types";

export const FEED_URL = "https://movilidad.ute.com.uy/api/v1/station/status/map";

const DEFAULT_TIMEOUT_MS = 20_000;

export type FeedOutcome = "success" | "fetch_error" | "parse_error";

export interface FeedResult {
  outcome: FeedOutcome;
  httpStatus: number | null;
  durationMs: number;
  payloadDigest: string | null;
  stations: StationPayload[];
  rejectedStations: number;
  errorMessage: string | null;
}

export interface FetchFeedOptions {
  url?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export async function fetchStationFeed(options: FetchFeedOptions = {}): Promise<FeedResult> {
  const url = options.url ?? FEED_URL;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const startedAt = Date.now();

  const timeout = AbortSignal.timeout(timeoutMs);
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;

  let response: Response;
  try {
    response = await fetch(url, {
      signal,
      cache: "no-store",
      headers: {
        accept: "application/json",
        uniqueKeyUser: "nginx",
      },
    });
  } catch (error) {
    return {
      outcome: "fetch_error",
      httpStatus: null,
      durationMs: Date.now() - startedAt,
      payloadDigest: null,
      stations: [],
      rejectedStations: 0,
      errorMessage: describeError(error),
    };
  }

  let body: string;
  try {
    body = await response.text();
  } catch (error) {
    return {
      outcome: "fetch_error",
      httpStatus: response.status,
      durationMs: Date.now() - startedAt,
      payloadDigest: null,
      stations: [],
      rejectedStations: 0,
      errorMessage: describeError(error),
    };
  }

  const durationMs = Date.now() - startedAt;

  if (!response.ok) {
    return {
      outcome: "fetch_error",
      httpStatus: response.status,
      durationMs,
      payloadDigest: null,
      stations: [],
      rejectedStations: 0,
      errorMessage: `Upstream responded with ${response.status}`,
    };
  }

  const payloadDigest = createHash("sha256").update(body).digest("hex");

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch (error) {
    return {
      outcome: "parse_error",
      httpStatus: response.status,
      durationMs,
      payloadDigest,
      stations: [],
      rejectedStations: 0,
      errorMessage: describeError(error),
    };
  }

  const envelope = stationFeedEnvelopeSchema.safeParse(parsed);
  if (!envelope.success) {
    return {
      outcome: "parse_error",
      httpStatus: response.status,
      durationMs,
      payloadDigest,
      stations: [],
      rejectedStations: 0,
      errorMessage: envelope.error.issues
        .slice(0, 5)
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; "),
    };
  }

  const stations: StationPayload[] = [];
  const rejections: string[] = [];

  for (const [index, record] of envelope.data.data.entries()) {
    const station = stationPayloadSchema.safeParse(record);
    if (station.success) {
      stations.push(station.data);
      continue;
    }
    const issue = station.error.issues[0];
    rejections.push(`#${index} ${issue ? `${issue.path.join(".")}: ${issue.message}` : "invalid"}`);
  }

  if (stations.length === 0 && envelope.data.data.length > 0) {
    return {
      outcome: "parse_error",
      httpStatus: response.status,
      durationMs,
      payloadDigest,
      stations: [],
      rejectedStations: rejections.length,
      errorMessage: `No station passed validation. ${rejections.slice(0, 3).join("; ")}`,
    };
  }

  return {
    outcome: "success",
    httpStatus: response.status,
    durationMs,
    payloadDigest,
    stations,
    rejectedStations: rejections.length,
    errorMessage:
      rejections.length > 0
        ? `Skipped ${rejections.length} invalid station(s): ${rejections.slice(0, 3).join("; ")}`
        : null,
  };
}

function describeError(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return String(error);
}
