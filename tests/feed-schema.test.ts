import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchStationFeedV2 } from "../src/lib/ute/v2-client";
import { usable } from "./helpers/feed";
import { connectorGroupPayloadSchema, stationPayloadSchema } from "../src/lib/ute/types";

interface BulkRecord {
  id: number;
  name: string;
  lat: number;
  lng: number;
}

const OPTIONS = { timeoutMs: 5_000, overallTimeoutMs: 20_000 };

const FREE_CCS2 = {
  count: 2,
  type: "CCS2",
  power: 60,
  status: 1,
  statusDetail: "Disponible",
  hose: true,
};

function bulkStations(count: number): BulkRecord[] {
  return Array.from({ length: count }, (_, index) => ({
    id: index + 1,
    name: `Station ${index + 1}`,
    lat: -34.9 - index / 100,
    lng: -56.1 - index / 100,
  }));
}

function detailBody(id: number, overrides: Record<string, unknown> = {}) {
  return {
    data: {
      id,
      name: `Station ${id}`,
      lat: -34.9,
      lng: -56.1,
      connectorStatusAcc: [FREE_CCS2],
      ...overrides,
    },
  };
}

function mockUte(stations: BulkRecord[], respondToDetail: (id: number) => Response) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = input.toString();
      if (url.endsWith("/token")) {
        return new Response(JSON.stringify({ access_token: "token" }), { status: 200 });
      }
      if (url.endsWith("/statusFilteredId")) {
        const body = JSON.parse(String(init?.body ?? "{}"));
        return respondToDetail(Number(body.stationIdentifier.StationId));
      }
      if (url.endsWith("/statusFiltered")) {
        return new Response(JSON.stringify({ data: stations }), { status: 200 });
      }
      throw new Error(`unexpected request to ${url}`);
    }),
  );
}

describe("the schema that declares the feed is the schema that validates it", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("refuses telemetry whose latitude is outside the range the schema declares", async () => {
    mockUte(bulkStations(10), (id) =>
      new Response(JSON.stringify(detailBody(id, id === 3 ? { lat: 991 } : {})), { status: 200 }),
    );

    const feed = usable(await fetchStationFeedV2(OPTIONS));

    expect(feed.outcome).toBe("success");
    const station = feed.stations.find((candidate) => candidate.name === "Station 3");
    expect(station?.lat).toBe(-34.92);
    expect(station?.connectorStatusAcc).toBeNull();
  });

  it("refuses telemetry whose longitude is outside the range the schema declares", async () => {
    mockUte(bulkStations(10), (id) =>
      new Response(JSON.stringify(detailBody(id, id === 7 ? { lng: -1000 } : {})), { status: 200 }),
    );

    const feed = usable(await fetchStationFeedV2(OPTIONS));

    const station = feed.stations.find((candidate) => candidate.name === "Station 7");
    expect(station?.connectorStatusAcc).toBeNull();
  });



  it("refuses the whole poll rather than reporting a feed with a station missing", async () => {
    const stations = bulkStations(10);
    stations[2].lat = 991;

    mockUte(stations, (id) => new Response(JSON.stringify(detailBody(id)), { status: 200 }));

    const feed = await fetchStationFeedV2(OPTIONS);

    expect(feed.outcome).toBe("parse_error");
    expect(feed.errorMessage).toContain("failed the feed schema");
    expect(feed.errorMessage).toContain("reads as one that left the network");
  });

  it("says which of the two causes starved the poll of telemetry", async () => {
    mockUte(bulkStations(10), (id) =>
      new Response(JSON.stringify(detailBody(id, id > 2 ? { lat: 991 } : {})), { status: 200 }),
    );

    const feed = await fetchStationFeedV2(OPTIONS);

    expect(feed.outcome).toBe("fetch_error");
    expect(feed.errorMessage).toContain("failed the feed schema");
    expect(feed.httpStatus).toBeNull();
  });

  it("never calls malformed telemetry silent, nor counts one station twice", async () => {
    mockUte(bulkStations(10), (id) =>
      new Response(JSON.stringify(detailBody(id, id === 5 ? { lat: -95.2 } : {})), { status: 200 }),
    );

    const feed = await fetchStationFeedV2(OPTIONS);

    expect(feed.errorMessage).toBe(
      "1 station(s) reported telemetry that failed the feed schema",
    );
  });

  it("keeps every station when the feed is within range", async () => {
    mockUte(bulkStations(10), (id) => new Response(JSON.stringify(detailBody(id)), { status: 200 }));

    const feed = usable(await fetchStationFeedV2(OPTIONS));

    expect(feed.stations).toHaveLength(10);
    expect(feed.errorMessage).toBeNull();
  });

  it("rejects an out-of-range bulk record at the boundary, before anything downstream sees it", async () => {
    const stations = bulkStations(10);
    stations[4].lat = 120;

    mockUte(stations, (id) => new Response(JSON.stringify(detailBody(id)), { status: 200 }));

    const feed = await fetchStationFeedV2(OPTIONS);

    expect(feed.outcome).toBe("parse_error");
  });

  it("bounds coordinates identically wherever the feed is parsed", () => {
    const bulkRecord = { id: 1, name: "Somewhere", lat: 991, lng: -56.1 };

    mockUte([bulkRecord], (id) => new Response(JSON.stringify(detailBody(id)), { status: 200 }));

    expect(stationPayloadSchema.safeParse({ name: "S", lat: 991, lng: -56.1 }).success).toBe(false);
  });

  it("refuses a station the feed did not locate rather than placing it at zero", () => {
    const within = { name: "Somewhere", lat: -34.9, lng: -56.1 };

    for (const missing of [null, "", "   ", false, []]) {
      expect(
        stationPayloadSchema.safeParse({ ...within, lat: missing }).success,
        `lat ${JSON.stringify(missing)} was accepted`,
      ).toBe(false);
      expect(
        stationPayloadSchema.safeParse({ ...within, lng: missing }).success,
        `lng ${JSON.stringify(missing)} was accepted`,
      ).toBe(false);
    }
  });

  it("refuses a connector group whose power the feed did not report", () => {
    const group = { count: 2, type: "CCS2", power: 60 };

    expect(connectorGroupPayloadSchema.safeParse(group).success).toBe(true);

    for (const missing of [null, "", "   ", false, []]) {
      expect(
        connectorGroupPayloadSchema.safeParse({ ...group, power: missing }).success,
        `power ${JSON.stringify(missing)} was accepted`,
      ).toBe(false);
    }
  });

  it("refuses a coordinate that is a number in some other base", () => {
    const within = { name: "Somewhere", lat: -34.9, lng: -56.1 };

    for (const notDecimal of ["0x10", "0b11", "0o17", "1_0", "12abc", "Infinity"]) {
      expect(
        stationPayloadSchema.safeParse({ ...within, lat: notDecimal }).success,
        `lat ${notDecimal} was accepted`,
      ).toBe(false);
    }
  });

  it("still reads a coordinate the feed sent as a string", () => {
    const parsed = stationPayloadSchema.safeParse({
      name: "Somewhere",
      lat: "-34.9",
      lng: " -56.1 ",
    });

    expect(parsed.success && parsed.data.lat).toBe(-34.9);
    expect(parsed.success && parsed.data.lng).toBe(-56.1);
  });

  it("bounds the coordinates it claims to bound", () => {
    const within = { name: "Somewhere", lat: -34.9, lng: -56.1 };

    expect(stationPayloadSchema.safeParse(within).success).toBe(true);
    expect(stationPayloadSchema.safeParse({ ...within, lat: 90.1 }).success).toBe(false);
    expect(stationPayloadSchema.safeParse({ ...within, lat: -90.1 }).success).toBe(false);
    expect(stationPayloadSchema.safeParse({ ...within, lng: 180.1 }).success).toBe(false);
    expect(stationPayloadSchema.safeParse({ ...within, lng: -180.1 }).success).toBe(false);
    expect(stationPayloadSchema.safeParse({ ...within, name: "" }).success).toBe(false);
  });
});
