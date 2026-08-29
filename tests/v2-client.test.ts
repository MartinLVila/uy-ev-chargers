import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchStationFeedV2 } from "../src/lib/ute/v2-client";

interface BulkRecord {
  id: number;
  name: string;
  lat: number;
  lng: number;
}

function bulkStations(count: number): BulkRecord[] {
  return Array.from({ length: count }, (_, index) => ({
    id: index + 1,
    name: `Station ${index + 1}`,
    lat: -34.9 - index / 100,
    lng: -56.1 - index / 100,
  }));
}

const CCS2_FREE = {
  count: 2,
  type: "CCS2",
  power: 60,
  status: 1,
  statusDetail: "Disponible",
  hose: true,
};
const TYPE2_FREE = {
  count: 1,
  type: "Tipo 2",
  power: 22,
  status: 1,
  statusDetail: "Disponible",
  hose: false,
};

function detailBody(id: number, groups: Record<string, unknown>[] = [CCS2_FREE]) {
  return {
    data: {
      id,
      name: `Station ${id}`,
      lat: -34.9,
      lng: -56.1,
      connectorStatusAcc: groups,
    },
  };
}

async function digestOf(
  stations: BulkRecord[],
  groups: Record<string, unknown>[],
): Promise<string | null> {
  mockUte(stations, (id) => new Response(JSON.stringify(detailBody(id, groups)), { status: 200 }));
  const feed = await fetchStationFeedV2(options);
  vi.unstubAllGlobals();
  expect(feed.outcome).toBe("success");
  return feed.payloadDigest;
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

const options = { timeoutMs: 5_000, overallTimeoutMs: 20_000 };

describe("fetchStationFeedV2", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rejects the whole poll when connector telemetry is missing for too many stations", async () => {
    mockUte(bulkStations(10), (id) =>
      id <= 2 ? new Response(JSON.stringify(detailBody(id)), { status: 200 })
              : new Response("", { status: 500 }),
    );

    const feed = await fetchStationFeedV2(options);

    expect(feed.outcome).toBe("fetch_error");
    expect(feed.stations).toHaveLength(0);
    expect(feed.errorMessage).toContain("8 of 10");
  });

  it("reports a rejected token distinctly from an unavailable station", async () => {
    mockUte(bulkStations(10), () => new Response("", { status: 401 }));

    const feed = await fetchStationFeedV2(options);

    expect(feed.outcome).toBe("fetch_error");
    expect(feed.httpStatus).toBe(401);
    expect(feed.errorMessage).toContain("rejected the token");
  });

  it("carries a station with no telemetry through as unknown rather than inventing a connector", async () => {
    mockUte(bulkStations(10), (id) =>
      id === 1 ? new Response("", { status: 404 })
               : new Response(JSON.stringify(detailBody(id)), { status: 200 }),
    );

    const feed = await fetchStationFeedV2(options);

    expect(feed.outcome).toBe("success");
    expect(feed.stations).toHaveLength(10);

    const withoutTelemetry = feed.stations.find((entry) => entry.name === "Station 1");
    expect(withoutTelemetry?.connectorStatusAcc).toBeNull();

    const reported = feed.stations.find((entry) => entry.name === "Station 2");
    expect(reported?.connectorStatusAcc).toHaveLength(1);

    expect(feed.errorMessage).toContain("1 station(s) reported no connector telemetry");
  });

  it("retries a station detail that fails before succeeding", async () => {
    const attempts = new Map<number, number>();
    mockUte(bulkStations(4), (id) => {
      const seen = (attempts.get(id) ?? 0) + 1;
      attempts.set(id, seen);
      if (id === 1 && seen < 3) return new Response("", { status: 502 });
      return new Response(JSON.stringify(detailBody(id)), { status: 200 });
    });

    const feed = await fetchStationFeedV2(options);

    expect(feed.outcome).toBe("success");
    expect(attempts.get(1)).toBe(3);
    expect(feed.stations.find((entry) => entry.name === "Station 1")?.connectorStatusAcc)
      .toHaveLength(1);
    expect(feed.errorMessage).toBeNull();
  });

  it("calls an unreachable bulk listing a fetch failure, not a malformed payload", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) => {
        const url = input.toString();
        if (url.endsWith("/token")) {
          return new Response(JSON.stringify({ access_token: "token" }), { status: 200 });
        }
        return new Response("upstream exploded", { status: 502 });
      }),
    );

    const feed = await fetchStationFeedV2(options);

    expect(feed.outcome).toBe("fetch_error");
    expect(feed.stations).toHaveLength(0);
    expect(feed.payloadDigest).toBeNull();
  });

  it("gives the same digest when only the order of stations and groups changes", async () => {
    const stations = bulkStations(3);

    const inOrder = await digestOf(stations, [CCS2_FREE, TYPE2_FREE]);
    const shuffled = await digestOf([...stations].reverse(), [TYPE2_FREE, CCS2_FREE]);

    expect(shuffled).toBe(inOrder);
  });

  it("gives a different digest when a connector changes state", async () => {
    const stations = bulkStations(3);

    const free = await digestOf(stations, [CCS2_FREE]);
    const charging = await digestOf(stations, [{ ...CCS2_FREE, statusDetail: "Cargando" }]);

    expect(charging).not.toBe(free);
  });
});
