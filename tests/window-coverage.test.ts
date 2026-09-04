import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { DashboardData } from "../src/lib/metrics/dashboard";
import type { DailyPoint, StationDetail } from "../src/lib/metrics/queries";
import {
  daysOfHistory,
  daysOfRange,
  lastDaysHeading,
  lastDaysPhrase,
  lastDaysSentence,
  observedSince,
  observedSpan,
} from "../src/lib/ui/coverage";

const loadDashboard = vi.hoisted(() => vi.fn());
const getStationDetail = vi.hoisted(() => vi.fn());
const getStationHourlyUsage = vi.hoisted(() => vi.fn());

vi.mock("@/lib/metrics/dashboard", () => ({ loadDashboard }));
vi.mock("@/components/StationMapPanel", () => ({ StationMapPanel: () => null }));
vi.mock("@/lib/db/client", () => ({ getDb: () => ({ execute: async () => ({ rows: [] }) }) }));
vi.mock("@/lib/metrics/queries", () => ({
  getStationDetail,
  getStationHourlyUsage,
  getStationStatuses: async () => [],
}));
vi.mock("@/components/ConnectorHistory", () => ({ ConnectorHistory: () => null }));
vi.mock("@/components/ConnectorUsageProfile", () => ({ ConnectorUsageProfile: () => null }));

const { default: DashboardPage } = await import("../src/app/page");
const { default: StationPage } = await import("../src/app/estaciones/[slug]/page");

const DAY_MS = 24 * 60 * 60 * 1000;

function readable(markup: string): string {
  return markup.replaceAll("<!-- -->", "");
}

function consecutiveDays(count: number, from = "2026-08-24"): DailyPoint[] {
  const start = Date.parse(`${from}T00:00:00Z`);
  return Array.from({ length: count }, (_, index) => ({
    day: new Date(start + index * DAY_MS).toISOString().slice(0, 10),
    connectorsTracked: 500,
    connectorsAbsent: 10,
    connectorsOutOfService: 40,
    outOfServiceRatio: 0.07,
    stationsDelisted: 0,
  }));
}

function dashboard(history: DailyPoint[]): DashboardData {
  return {
    snapshot: {
      stations: { total: 251, listed: 251, silent: 0, delisted: 0 },
      connectors: {
        reported: 594,
        operational: 554,
        faulted: 27,
        unknown: 0,
        absent: 15,
        outOfService: 42,
      },
      lastSuccessfulPollAt: "2026-09-04T19:00:00.000Z",
    } as DashboardData["snapshot"],
    feed: {
      windowDays: 90,
      polls: 100,
      successes: 100,
      failures: 0,
      successRate: 1,
      distinctPayloads: 90,
      identicalPayloadStreak: 0,
      lastFailureAt: null,
      unchangedSince: null,
    } as DashboardData["feed"],
    departments: [],
    stations: [],
    reliability: [],
    history,
    historyDays: 90,
    reliabilityDays: 30,
  };
}

async function renderDashboard(history: DailyPoint[]): Promise<string> {
  loadDashboard.mockResolvedValue(dashboard(history));
  return readable(renderToStaticMarkup(await DashboardPage()));
}

function detail(firstSeenDaysAgo: number, truncated = false): StationDetail {
  const firstSeenAt = new Date(Date.now() - firstSeenDaysAgo * DAY_MS).toISOString();
  return {
    slug: "una-estacion",
    name: "Una Estación",
    address: null,
    city: "Montevideo",
    department: "Montevideo",
    latitude: -34.9,
    longitude: -56.2,
    firstSeenAt,
    lastSeenAt: new Date().toISOString(),
    presence: "listed",
    timeline: [],
    timelineTruncated: truncated,
    timelineCoversFrom: truncated ? new Date(Date.now() - 2 * DAY_MS).toISOString() : null,
  };
}

async function renderStation(station: StationDetail): Promise<string> {
  getStationDetail.mockResolvedValue(station);
  getStationHourlyUsage.mockResolvedValue([]);
  return readable(
    renderToStaticMarkup(await StationPage({ params: Promise.resolve({ slug: station.slug }) })),
  );
}

describe("the covered span is measured, not assumed", () => {
  it("counts the days the history actually holds, not the span it straddles", () => {
    expect(daysOfHistory(consecutiveDays(12), 90)).toBe(12);
    expect(daysOfHistory(consecutiveDays(1), 90)).toBe(1);
    expect(daysOfHistory([], 90)).toBe(0);
  });

  it("does not count a gap as covered", () => {
    const now = Date.parse("2026-09-04T19:00:00.000Z");
    const withAGap = [...consecutiveDays(10, "2026-07-27"), ...consecutiveDays(1, "2026-09-04")];

    expect(withAGap).toHaveLength(11);
    expect(daysOfHistory(withAGap, 90, now), "the 40-day straddle is not 40 days of data").toBe(11);
  });

  it("counts only the rows inside the window it is asked about", () => {
    const now = Date.parse("2026-09-04T19:00:00.000Z");
    const stopped = consecutiveDays(50, "2026-06-16");

    expect(daysOfHistory(stopped, 90, now)).toBe(50);
    expect(
      daysOfHistory(stopped, 30, now),
      "ingestion stopped 31 days ago, so the 30-day window holds nothing",
    ).toBe(0);
  });

  it("never reports more than the window that was asked for", () => {
    expect(daysOfHistory(consecutiveDays(120), 90)).toBe(90);
    expect(daysOfHistory(consecutiveDays(12), 30)).toBe(12);
  });

  it("measures a span between two instants, clamped the same way", () => {
    const end = Date.parse("2026-09-04T19:00:00.000Z");

    expect(daysOfRange({ start: end - 12 * DAY_MS, end }, 90)).toBe(12);
    expect(daysOfRange({ start: end - 120 * DAY_MS, end }, 90)).toBe(90);
    expect(daysOfRange(null, 90)).toBe(0);
  });

  it("counts a span shorter than a day as a day rather than as nothing", () => {
    const end = Date.parse("2026-09-04T19:00:00.000Z");

    expect(daysOfRange({ start: end - 3600_000, end }, 90)).toBe(1);
  });

  it("starts observing a station when it was first seen, not when the window opens", () => {
    const window = { from: new Date("2026-06-06T00:00:00Z"), to: new Date("2026-09-04T00:00:00Z") };

    expect(daysOfRange(observedSince("2026-08-24T00:00:00Z", window), 90)).toBe(11);
    expect(daysOfRange(observedSince("2020-01-01T00:00:00Z", window), 90)).toBe(90);
  });

  it("claims nothing when the station's first sighting is unreadable", () => {
    const window = { from: new Date("2026-06-06T00:00:00Z"), to: new Date("2026-09-04T00:00:00Z") };

    expect(
      daysOfRange(observedSince("", window), 90),
      "an unknown first sighting claimed the whole window",
    ).toBe(0);
    expect(daysOfRange(observedSince("not a date", window), 90)).toBe(0);
  });

  it("agrees with itself about singular and plural in every position", () => {
    expect(lastDaysHeading(1)).toBe("El último día");
    expect(lastDaysHeading(12)).toBe("Los últimos 12 días");
    expect(lastDaysSentence(1)).toBe("Último día");
    expect(lastDaysSentence(12)).toBe("Últimos 12 días");
    expect(lastDaysPhrase(1)).toBe("el último día");
    expect(lastDaysPhrase(12)).toBe("los últimos 12 días");
  });

  it("says there is no history rather than naming a window of zero days", () => {
    expect(lastDaysHeading(0)).toBe("Todavía sin historial");
    expect(lastDaysSentence(0)).toBe("Todavía sin historial");
    expect(lastDaysPhrase(0)).toBe("el período que se muestra");
    expect(observedSpan(0)).toBe("el tiempo que llevamos observando esta estación");
  });

  it("carries its own trailing clause so the sentence never doubles it", () => {
    expect(observedSpan(12)).toBe("los últimos 12 días que llevamos observando esta estación");
    expect(observedSpan(1)).toBe("el último día");
    expect(observedSpan(0)).not.toContain("que llevamos observando esta estación que");
  });
});

describe("the dashboard names the span it has, not the one it asked for", () => {
  it("says twelve days when twelve days were recorded against a ninety-day window", async () => {
    const markup = await renderDashboard(consecutiveDays(12));

    expect(markup).toContain("Los últimos 12 días");
    expect(markup, "the requested window is still being printed as fact").not.toContain(
      "Los últimos 90 días",
    );
  });

  it("clamps the reliability caption to the history it has, not to its own window", async () => {
    const markup = await renderDashboard(consecutiveDays(12));

    expect(markup).toContain("Últimos 12 días, ponderado");
    expect(markup).not.toContain("Últimos 30 días");
  });

  it("names the full window once the history reaches it", async () => {
    const markup = await renderDashboard(consecutiveDays(120));

    expect(markup).toContain("Los últimos 90 días");
    expect(markup).toContain("Últimos 30 días, ponderado");
  });
});

describe("a station page names the span it has been observed for", () => {
  it("counts from the day the station first appeared", async () => {
    const markup = await renderStation(detail(12));

    expect(markup).toContain("durante los últimos 12 días.");
    expect(markup).toContain("los últimos 12 días que llevamos observando esta estación");
    expect(markup).not.toContain("90 días");
  });

  it("reads as a sentence on a station seen for less than two days", async () => {
    const markup = await renderStation(detail(0.4));

    expect(markup).toContain("durante el último día");
    expect(markup, "an article was left in front of a singular count").not.toContain("los 1 día");
    expect(markup).not.toContain("los últimos 1 día");
  });

  it("stops at the window for a station older than it", async () => {
    const markup = await renderStation(detail(400));

    expect(markup).toContain("los últimos 90 días que llevamos observando esta estación");
  });

  it("captions the day grid with what it draws and the hourly chart with what it read", async () => {
    const markup = await renderStation(detail(30, true));

    expect(markup, "the grid only reaches back to the row-limit cutoff").toContain(
      "durante los últimos 2 días.",
    );
    expect(
      markup,
      "the hourly aggregate covers the window, so a row-limit cutoff must not shorten its caption",
    ).toContain("los últimos 30 días que llevamos observando esta estación");
  });

  it("does not turn a row-limit cutoff into a claim about elapsed days", async () => {
    const markup = await renderStation(detail(30, true));

    expect(markup).toContain("Cada cambio, los más recientes");
    expect(markup).not.toContain("Cada cambio, en los últimos 30 días");
  });

  it("never doubles the trailing clause when nothing has been observed", async () => {
    const unknownFirstSighting = { ...detail(12), firstSeenAt: "" };
    const markup = await renderStation(unknownFirstSighting);

    expect(markup).toContain(
      "durante el tiempo que llevamos observando esta estación, medido sobre",
    );
    expect(markup).not.toContain("observando esta estación que llevamos observando");
    expect(
      markup,
      "an unknown first sighting claimed the whole window as observed",
    ).not.toContain("los últimos 90 días que llevamos observando");
  });
});
