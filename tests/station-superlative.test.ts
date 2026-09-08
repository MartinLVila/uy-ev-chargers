import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StationDetail } from "../src/lib/metrics/queries";

const detail = vi.hoisted(() => vi.fn());
const hourlyUsage = vi.hoisted(() => vi.fn());
const worstOutageStation = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/client", () => ({ getDb: () => ({}) }));

vi.mock("@/lib/metrics/queries", async () => {
  const actual = await vi.importActual<typeof import("../src/lib/metrics/queries")>(
    "../src/lib/metrics/queries",
  );
  return {
    ...actual,
    getStationDetail: detail,
    getStationHourlyUsage: hourlyUsage,
    getWorstOutageStation: worstOutageStation,
  };
});

function station(overrides: Partial<StationDetail> = {}): StationDetail {
  return {
    slug: "una-estacion",
    name: "Una Estación",
    address: "Calle 1",
    city: "Montevideo",
    department: "Montevideo",
    latitude: -34.9,
    longitude: -56.2,
    firstSeenAt: "2026-08-01T00:00:00.000Z",
    lastSeenAt: "2026-09-01T00:00:00.000Z",
    presence: "listed",
    timeline: [
      {
        connectorType: "CCS",
        powerKw: 50,
        hasCable: true,
        connectorCount: 7,
        health: "faulted",
        statusDetail: "unavailable",
        startedAt: "2026-08-20T00:00:00.000Z",
        endedAt: null,
      },
    ],
    timelineTruncated: false,
    timelineCoversFrom: null,
    ...overrides,
  };
}

async function renderStation(): Promise<string> {
  const { default: StationPage } = await import("../src/app/estaciones/[slug]/page");
  const element = await StationPage({ params: Promise.resolve({ slug: "una-estacion" }) });
  return renderToStaticMarkup(element);
}

describe("the national-worst paragraph only appears for the actual national worst", () => {
  beforeEach(() => {
    vi.resetModules();
    detail.mockReset();
    hourlyUsage.mockReset();
    worstOutageStation.mockReset();
    hourlyUsage.mockResolvedValue([]);
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("says nothing when this station is not the worst in the country", async () => {
    detail.mockResolvedValue(station());
    worstOutageStation.mockResolvedValue({ slug: "otra-estacion", outOfServiceSeconds: 999999 });

    const markup = await renderStation();

    expect(markup).not.toContain("La estación con más horas");
  });

  it("says nothing when nothing is out of service anywhere", async () => {
    detail.mockResolvedValue(station());
    worstOutageStation.mockResolvedValue(null);

    const markup = await renderStation();

    expect(markup).not.toContain("La estación con más horas");
  });

  it("states the ranking and the live count when this station is the worst", async () => {
    detail.mockResolvedValue(station());
    worstOutageStation.mockResolvedValue({ slug: "una-estacion", outOfServiceSeconds: 1036 * 3600 });

    const markup = await renderStation();

    expect(markup).toContain("La estación con más horas·conector caídas del país");
    expect(markup).toContain("7 de sus 7 conectores no reportan servicio ahora mismo");
  });

  it("degrades to no paragraph, rather than failing the page, when the ranking read throws", async () => {
    detail.mockResolvedValue(station());
    worstOutageStation.mockRejectedValue(new Error("Failed query"));

    const markup = await renderStation();

    expect(markup).toContain("Una Estación");
    expect(markup).not.toContain("La estación con más horas");
  });
});
