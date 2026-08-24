import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchStationFeed } from "../src/lib/ute/client";

const VALID_STATION = {
  source: "CargaME",
  name: "Good station",
  address: "Street 1",
  lat: -34.9,
  lng: -56.1,
  department: "Montevideo",
  city: "Montevideo",
  status: "Cargando",
  connectorStatusAcc: [
    { count: 1, type: "CCS2", power: 60, status: 1, statusDetail: "Busy", hose: true },
  ],
};

function respondWith(body: unknown, init: { status?: number } = {}) {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(text, { status: init.status ?? 200 })),
  );
}

describe("fetchStationFeed", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps the valid stations when one record is malformed", async () => {
    respondWith({
      data: [VALID_STATION, { ...VALID_STATION, name: "" }, { ...VALID_STATION, lat: 999 }],
    });

    const result = await fetchStationFeed();

    expect(result.outcome).toBe("success");
    expect(result.stations).toHaveLength(1);
    expect(result.rejectedStations).toBe(2);
    expect(result.errorMessage).toContain("Skipped 2");
  });

  it("reports a parse error only when no record survives", async () => {
    respondWith({ data: [{ ...VALID_STATION, name: "" }] });

    const result = await fetchStationFeed();

    expect(result.outcome).toBe("parse_error");
    expect(result.stations).toHaveLength(0);
    expect(result.rejectedStations).toBe(1);
  });

  it("accepts an empty feed without treating it as an error", async () => {
    respondWith({ data: [] });

    const result = await fetchStationFeed();

    expect(result.outcome).toBe("success");
    expect(result.stations).toHaveLength(0);
    expect(result.errorMessage).toBeNull();
  });

  it("records a non-2xx response as a fetch error", async () => {
    respondWith({ data: [] }, { status: 503 });

    const result = await fetchStationFeed();

    expect(result.outcome).toBe("fetch_error");
    expect(result.httpStatus).toBe(503);
    expect(result.payloadDigest).toBeNull();
  });

  it("reports malformed JSON as a parse error and still digests the body", async () => {
    respondWith("not json at all");

    const result = await fetchStationFeed();

    expect(result.outcome).toBe("parse_error");
    expect(result.payloadDigest).toMatch(/^[0-9a-f]{64}$/);
  });

  it("treats a transport failure as a fetch error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("network down");
      }),
    );

    const result = await fetchStationFeed();

    expect(result.outcome).toBe("fetch_error");
    expect(result.httpStatus).toBeNull();
    expect(result.errorMessage).toContain("network down");
  });

  it("produces the same digest for identical bodies", async () => {
    respondWith({ data: [VALID_STATION] });
    const first = await fetchStationFeed();
    const second = await fetchStationFeed();

    expect(first.payloadDigest).toBe(second.payloadDigest);
  });
});
