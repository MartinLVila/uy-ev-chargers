import { createHash } from "node:crypto";
import type { FeedResult, StationPayload, UnusableFeed, UsableFeed } from "../../src/lib/ute/types";

export interface StationOverrides {
  name?: string;
  lat?: number;
  lng?: number;
  department?: string;
  city?: string;
  address?: string;
  connectors?: Array<{
    count: number;
    type?: string;
    power?: number;
    status?: number | null;
    statusDetail?: string | null;
    hose?: boolean;
  }> | null;
}

export function station(overrides: StationOverrides = {}): StationPayload {
  return {
    source: "CargaME",
    name: overrides.name ?? "Test Station",
    address: overrides.address ?? "Some street 123",
    lat: overrides.lat ?? -34.9,
    lng: overrides.lng ?? -56.15,
    department: overrides.department ?? "Montevideo",
    city: overrides.city ?? "Montevideo",
    status: "Cargando",
    connectorStatusAcc:
      overrides.connectors === null
        ? null
        : (overrides.connectors ?? [{ count: 2 }]).map((connector) => ({
            count: connector.count,
            type: connector.type ?? "CCS2",
            power: connector.power ?? 60,
            status: connector.status === undefined ? 1 : connector.status,
            statusDetail: connector.statusDetail === undefined ? "Busy" : connector.statusDetail,
            hose: connector.hose ?? true,
          })),
  };
}

export function successFeed(stations: StationPayload[]): UsableFeed {
  return {
    outcome: "success",
    httpStatus: 200,
    durationMs: 120,
    payloadDigest: createHash("sha256").update(JSON.stringify(stations)).digest("hex"),
    stations,
    rejectedStations: 0,
    errorMessage: null,
  };
}

export function failedFeed(message = "connection refused"): UnusableFeed {
  return {
    outcome: "fetch_error",
    httpStatus: null,
    durationMs: 50,
    errorMessage: message,
  };
}

export function usable(feed: FeedResult): UsableFeed {
  if (feed.outcome !== "success") {
    throw new Error(`expected a usable feed, got ${feed.outcome}: ${feed.errorMessage}`);
  }
  return feed;
}
