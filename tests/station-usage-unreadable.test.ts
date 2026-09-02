import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConnectorGroupHourlyUsage, StationDetail } from "../src/lib/metrics/queries";

const detail = vi.hoisted(() => vi.fn());
const hourlyUsage = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/client", () => ({ getDb: () => ({}) }));

vi.mock("@/lib/metrics/queries", async () => {
  const actual = await vi.importActual<typeof import("../src/lib/metrics/queries")>(
    "../src/lib/metrics/queries",
  );
  return {
    ...actual,
    getStationDetail: detail,
    getStationHourlyUsage: hourlyUsage,
  };
});

const NO_OBSERVATIONS = "Todavía no hay observaciones suficientes";
const COULD_NOT_READ = "No pudimos leer el uso por hora";

function station(): StationDetail {
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
    timeline: [],
    timelineTruncated: false,
    timelineCoversFrom: null,
  };
}

function usageGroup(): ConnectorGroupHourlyUsage {
  return {
    connectorGroupId: 1,
    connectorType: "CCS",
    powerKw: 50,
    hasCable: true,
    connectorCount: 1,
    hours: Array.from({ length: 24 }, (_, hour) => ({
      hour,
      utilization: 0.5,
      brokenShare: 0,
      observedHours: 30,
    })),
  };
}

async function renderStation(): Promise<string> {
  const { default: StationPage } = await import("../src/app/estaciones/[slug]/page");
  const element = await StationPage({ params: Promise.resolve({ slug: "una-estacion" }) });
  return renderToStaticMarkup(element);
}

describe("a station page that could not read its hourly usage says so", () => {
  beforeEach(() => {
    vi.resetModules();
    detail.mockReset();
    hourlyUsage.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("never claims there are no observations when the read failed", async () => {
    detail.mockResolvedValue(station());
    hourlyUsage.mockRejectedValue(new Error("Failed query"));

    const markup = await renderStation();

    expect(markup).toContain(COULD_NOT_READ);
    expect(markup, "a failed read is presented as an absence of data").not.toContain(
      NO_OBSERVATIONS,
    );
  });

  it("still says there are no observations when the read succeeded and found none", async () => {
    detail.mockResolvedValue(station());
    hourlyUsage.mockResolvedValue([]);

    const markup = await renderStation();

    expect(markup).toContain(NO_OBSERVATIONS);
    expect(markup).not.toContain(COULD_NOT_READ);
  });

  it("leaves the rest of the page standing when only the usage read failed", async () => {
    detail.mockResolvedValue(station());
    hourlyUsage.mockRejectedValue(new Error("Failed query"));

    const markup = await renderStation();

    expect(markup).toContain("Una Estación");
    expect(markup).toContain("A qué hora se ocupa");
  });

  it("gives up only after a second read, so one bad moment does not bake in", async () => {
    detail.mockResolvedValue(station());
    hourlyUsage.mockRejectedValue(new Error("Failed query"));

    await renderStation();

    expect(hourlyUsage).toHaveBeenCalledTimes(2);
  });

  it("draws the profile when the read fails once and the retry succeeds", async () => {
    detail.mockResolvedValue(station());
    hourlyUsage
      .mockRejectedValueOnce(new Error("Failed query"))
      .mockResolvedValueOnce([usageGroup()]);

    const markup = await renderStation();

    expect(markup).toContain("CCS · 50 kW");
    expect(markup).not.toContain(COULD_NOT_READ);
    expect(markup).not.toContain(NO_OBSERVATIONS);
  });
});
