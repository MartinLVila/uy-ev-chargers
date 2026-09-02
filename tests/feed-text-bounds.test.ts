import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchStationFeedV2 } from "../src/lib/ute/v2-client";
import { usable } from "./helpers/feed";
import {
  MAX_CONNECTOR_GROUPS_PER_STATION,
  MAX_FEED_TEXT,
  stationPayloadSchema,
} from "../src/lib/ute/types";

const OPTIONS = { timeoutMs: 5_000, overallTimeoutMs: 20_000 };

const LONGEST_NAME_UTE_ACTUALLY_SENDS = 44;
const LONGEST_ADDRESS_UTE_ACTUALLY_SENDS = 75;
const LONGEST_CITY_UTE_ACTUALLY_SENDS = 45;
const LONGEST_STATUS_DETAIL_UTE_ACTUALLY_SENDS = 11;
const LONGEST_CONNECTOR_TYPE_UTE_ACTUALLY_SENDS = 6;

const A_MEGABYTE = 1_000_000;

const FREE_CCS2 = {
  count: 2,
  type: "CCS2",
  power: 60,
  status: 1,
  statusDetail: "Disponible",
  hose: true,
};

function text(length: number): string {
  return "a".repeat(length);
}

function bulkStations(count: number, overrides: Record<string, unknown> = {}) {
  return Array.from({ length: count }, (_, index) => ({
    id: index + 1,
    name: `Station ${index + 1}`,
    lat: -34.9 - index / 100,
    lng: -56.1 - index / 100,
    ...(index === 0 ? overrides : {}),
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

function mockUte(
  stations: ReturnType<typeof bulkStations>,
  respondToDetail: (id: number) => Response,
) {
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

describe("no string the feed sends reaches storage unbounded", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("refuses the whole poll when a listed station arrives with a runaway name", async () => {
    mockUte(bulkStations(10, { name: text(A_MEGABYTE) }), (id) =>
      new Response(JSON.stringify(detailBody(id)), { status: 200 }),
    );

    const feed = await fetchStationFeedV2(OPTIONS);

    expect(feed.outcome).toBe("parse_error");
    expect(feed.errorMessage).toContain("failed the feed schema");
  });

  it("drops a runaway address without throwing away the telemetry beside it", async () => {
    mockUte(bulkStations(10), (id) =>
      new Response(
        JSON.stringify(detailBody(id, id === 4 ? { address: text(A_MEGABYTE) } : {})),
        { status: 200 },
      ),
    );

    const feed = usable(await fetchStationFeedV2(OPTIONS));

    const station = feed.stations.find((candidate) => candidate.name === "Station 4");
    expect(station?.address).toBeNull();
    expect(station?.connectorStatusAcc).toHaveLength(1);
    expect(feed.outcome).toBe("success");
    expect(feed.errorMessage).toBeNull();
  });

  it("rejects a runaway connector status instead of truncating it", async () => {
    mockUte(bulkStations(10), (id) =>
      new Response(
        JSON.stringify(
          detailBody(
            id,
            id === 6
              ? { connectorStatusAcc: [{ ...FREE_CCS2, statusDetail: text(A_MEGABYTE) }] }
              : {},
          ),
        ),
        { status: 200 },
      ),
    );

    const feed = usable(await fetchStationFeedV2(OPTIONS));

    const station = feed.stations.find((candidate) => candidate.name === "Station 6");
    expect(station?.connectorStatusAcc).toBeNull();
    expect(JSON.stringify(feed.stations)).not.toContain(text(1_000));
  });

  it("rejects a station claiming more connector groups than any station has", async () => {
    const tooMany = Array.from({ length: MAX_CONNECTOR_GROUPS_PER_STATION + 1 }, () => FREE_CCS2);
    mockUte(bulkStations(10), (id) =>
      new Response(JSON.stringify(detailBody(id, id === 2 ? { connectorStatusAcc: tooMany } : {})), {
        status: 200,
      }),
    );

    const feed = usable(await fetchStationFeedV2(OPTIONS));

    const station = feed.stations.find((candidate) => candidate.name === "Station 2");
    expect(station?.connectorStatusAcc).toBeNull();
  });

  it("leaves room above what the feed really sends, so a normal poll still lands", async () => {
    mockUte(bulkStations(10), (id) =>
      new Response(
        JSON.stringify(
          detailBody(id, {
            name: text(LONGEST_NAME_UTE_ACTUALLY_SENDS),
            address: text(LONGEST_ADDRESS_UTE_ACTUALLY_SENDS),
            city: text(LONGEST_CITY_UTE_ACTUALLY_SENDS),
            connectorStatusAcc: [
              {
                ...FREE_CCS2,
                type: text(LONGEST_CONNECTOR_TYPE_UTE_ACTUALLY_SENDS),
                statusDetail: text(LONGEST_STATUS_DETAIL_UTE_ACTUALLY_SENDS),
              },
            ],
          }),
        ),
        { status: 200 },
      ),
    );

    const feed = usable(await fetchStationFeedV2(OPTIONS));

    expect(feed.outcome).toBe("success");
    expect(feed.stations).toHaveLength(10);
    expect(feed.stations[0].address).toHaveLength(LONGEST_ADDRESS_UTE_ACTUALLY_SENDS);
  });

  it("stores a value at the limit whole rather than clipping it", () => {
    const parsed = stationPayloadSchema.safeParse({
      name: text(MAX_FEED_TEXT.name),
      lat: -34.9,
      lng: -56.1,
    });

    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.name).toHaveLength(MAX_FEED_TEXT.name);
  });

  it("draws the line one character past the limit", () => {
    const parsed = stationPayloadSchema.safeParse({
      name: text(MAX_FEED_TEXT.name + 1),
      lat: -34.9,
      lng: -56.1,
    });

    expect(parsed.success).toBe(false);
  });

  it("bounds every string field the schema declares, including ones added later", () => {
    const longestLimit = Math.max(...Object.values(MAX_FEED_TEXT));
    const beyondAnyLimit = text(longestLimit + 1);

    const stringFields = Object.keys(stationPayloadSchema.shape).filter((field) =>
      stationPayloadSchema.safeParse({ name: "Station", lat: -34.9, lng: -56.1, [field]: "x" })
        .success,
    );

    const kept = stringFields.filter((field) => {
      const parsed = stationPayloadSchema.safeParse({
        name: "Station",
        lat: -34.9,
        lng: -56.1,
        [field]: beyondAnyLimit,
      });
      return parsed.success && parsed.data[field as keyof typeof parsed.data] === beyondAnyLimit;
    });

    expect(stringFields.length).toBeGreaterThan(4);
    expect(kept).toEqual([]);
  });
});

describe("no response is buffered without a ceiling", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("stops reading a bulk response that runs past the budget", async () => {
    const enormous = { data: [{ id: 1, name: text(8 * 1024 * 1024), lat: -34.9, lng: -56.1 }] };
    mockUte([], () => new Response("{}", { status: 200 }));
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) => {
        const url = input.toString();
        if (url.endsWith("/token")) {
          return new Response(JSON.stringify({ access_token: "token" }), { status: 200 });
        }
        return new Response(JSON.stringify(enormous), { status: 200 });
      }),
    );

    const feed = await fetchStationFeedV2(OPTIONS);

    expect(feed.outcome).toBe("fetch_error");
    expect(feed.errorMessage).toContain("byte budget");
  });

  it("believes a declared length before it reads a single chunk", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) => {
        const url = input.toString();
        if (url.endsWith("/token")) {
          return new Response(JSON.stringify({ access_token: "token" }), { status: 200 });
        }
        return new Response(JSON.stringify({ data: [] }), {
          status: 200,
          headers: { "content-length": String(9 * 1024 * 1024) },
        });
      }),
    );

    const feed = await fetchStationFeedV2(OPTIONS);

    expect(feed.outcome).toBe("fetch_error");
    expect(feed.errorMessage).toContain("declares");
  });

  it("treats an oversized station detail as malformed, not as a silent station", async () => {
    const bulk = bulkStations(10);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL, init?: RequestInit) => {
        const url = input.toString();
        if (url.endsWith("/token")) {
          return new Response(JSON.stringify({ access_token: "token" }), { status: 200 });
        }
        if (url.endsWith("/statusFilteredId")) {
          const body = JSON.parse(String(init?.body ?? "{}"));
          const id = Number(body.stationIdentifier.StationId);
          if (id === 5) {
            return new Response(
              JSON.stringify(detailBody(id, { address: text(8 * 1024 * 1024) })),
              { status: 200 },
            );
          }
          return new Response(JSON.stringify(detailBody(id)), { status: 200 });
        }
        return new Response(JSON.stringify({ data: bulk }), { status: 200 });
      }),
    );

    const feed = usable(await fetchStationFeedV2(OPTIONS));

    expect(feed.errorMessage).toContain("failed the feed schema");
    const station = feed.stations.find((candidate) => candidate.name === "Station 5");
    expect(station?.connectorStatusAcc).toBeNull();
  });
});
