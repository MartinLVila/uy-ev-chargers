import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StationDetail } from "../src/lib/metrics/queries";

const snapshot = vi.hoisted(() => vi.fn());
const feedHealth = vi.hoisted(() => vi.fn());
const departments = vi.hoisted(() => vi.fn());
const stationStatuses = vi.hoisted(() => vi.fn());
const reliability = vi.hoisted(() => vi.fn());
const dailyHistory = vi.hoisted(() => vi.fn());
const detail = vi.hoisted(() => vi.fn());
const hourlyUsage = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/client", () => ({
  getDb: () => ({}),
  databaseIsConfigured: () => Boolean(process.env.DATABASE_URL),
}));

vi.mock("@/lib/metrics/queries", async () => {
  const actual = await vi.importActual<typeof import("../src/lib/metrics/queries")>(
    "../src/lib/metrics/queries",
  );
  return {
    ...actual,
    getNetworkSnapshot: snapshot,
    getFeedHealth: feedHealth,
    getDepartmentBreakdown: departments,
    getStationStatuses: stationStatuses,
    getStationReliability: reliability,
    getDailyHistory: dailyHistory,
    getStationDetail: detail,
    getStationHourlyUsage: hourlyUsage,
  };
});

vi.mock("@/components/StationMapPanel", () => ({ StationMapPanel: () => null }));

const DASHBOARD_COPY = "No pudimos leer los datos en este momento";
const STATION_COPY = "No pudimos leer los datos de esta estación en este momento";

function everyOtherDashboardQuerySucceeds(): void {
  feedHealth.mockResolvedValue({});
  departments.mockResolvedValue([]);
  stationStatuses.mockResolvedValue([]);
  reliability.mockResolvedValue([]);
  dailyHistory.mockResolvedValue([]);
}

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

function sourceOf(path: string): string {
  return readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8");
}

describe("a page that cannot read its data raises, so nothing cacheable is produced", () => {
  const configured = process.env.DATABASE_URL;

  beforeEach(() => {
    vi.resetModules();
    process.env.DATABASE_URL = "postgresql://reader@example.invalid/db?sslmode=require";
    snapshot.mockReset();
    detail.mockReset();
    hourlyUsage.mockReset();
    everyOtherDashboardQuerySucceeds();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    if (configured === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = configured;
    vi.restoreAllMocks();
  });

  it("carries a failed dashboard query out of the loader instead of reporting no data", async () => {
    const failure = new Error("Failed query");
    snapshot.mockRejectedValue(failure);

    const { loadDashboard } = await import("../src/lib/metrics/dashboard");

    await expect(loadDashboard()).rejects.toThrow(failure);
  });

  it("reports no data, rather than a failure, when no database is configured at all", async () => {
    delete process.env.DATABASE_URL;
    snapshot.mockRejectedValue(new Error("Failed query"));

    const { loadDashboard } = await import("../src/lib/metrics/dashboard");

    await expect(loadDashboard()).resolves.toBeNull();
    expect(snapshot, "an unconfigured environment has nothing to query").not.toHaveBeenCalled();
  });

  it("does not claim no reading was ever recorded when it never looked", async () => {
    delete process.env.DATABASE_URL;

    const { default: DashboardPage } = await import("../src/app/page");
    const markup = renderToStaticMarkup(await DashboardPage());

    expect(markup).toContain("No hay datos para mostrar en este momento");
    expect(markup, "nobody observed that").not.toContain("Todavía no se registró ninguna lectura");
  });

  it("leaves a trace in the log on the way out", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    snapshot.mockRejectedValue(new Error("Failed query"));

    const { loadDashboard } = await import("../src/lib/metrics/dashboard");
    await expect(loadDashboard()).rejects.toThrow();

    expect(logged).toHaveBeenCalled();
  });

  it("rejects the dashboard render rather than returning a body Next would store as a success", async () => {
    snapshot.mockRejectedValue(new Error("Failed query"));

    const { default: DashboardPage } = await import("../src/app/page");

    await expect(DashboardPage()).rejects.toThrow("Failed query");
  });

  it("rejects the station render when the detail query fails", async () => {
    detail.mockRejectedValue(new Error("Failed query"));
    hourlyUsage.mockResolvedValue([]);

    const { default: StationPage } = await import("../src/app/estaciones/[slug]/page");

    await expect(
      StationPage({ params: Promise.resolve({ slug: "una-estacion" }) }),
    ).rejects.toThrow("Failed query");
  });

  it("still renders a station whose detail query succeeded", async () => {
    detail.mockResolvedValue(station());
    hourlyUsage.mockResolvedValue([]);

    const { default: StationPage } = await import("../src/app/estaciones/[slug]/page");
    const markup = renderToStaticMarkup(
      await StationPage({ params: Promise.resolve({ slug: "una-estacion" }) }),
    );

    expect(markup).toContain("Una Estación");
  });
});

describe("no page answers a failed read with a body of its own", () => {
  it("stopped carrying the failure copy that made the response a 200", () => {
    expect(sourceOf("app/page.tsx")).not.toContain(DASHBOARD_COPY);

    const stationPage = sourceOf("app/estaciones/[slug]/page.tsx");
    expect(stationPage).not.toContain("No se pudo cargar la estación");
    expect(stationPage).not.toContain(STATION_COPY);
  });

  it("keeps the empty database a success, since a reachable empty database is not a failure", () => {
    expect(sourceOf("app/page.tsx")).toContain("Todavía no se registró ninguna lectura");
  });

});
