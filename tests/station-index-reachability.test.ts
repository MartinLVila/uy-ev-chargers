import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { StationsIndex } from "../src/components/StationsIndex";
import type { StationStatus } from "../src/lib/metrics/queries";
import type { DashboardData } from "../src/lib/metrics/dashboard";

const loadDashboard = vi.hoisted(() => vi.fn());
const loadStationList = vi.hoisted(() => vi.fn());

vi.mock("@/lib/metrics/dashboard", () => ({ loadDashboard }));
vi.mock("@/lib/metrics/station-list", () => ({ loadStationList }));
vi.mock("@/components/StationMapPanel", () => ({ StationMapPanel: () => null }));

const { default: DashboardPage } = await import("../src/app/page");
const { default: StationsPage } = await import("../src/app/estaciones/page");

function station(overrides: Partial<StationStatus> = {}): StationStatus {
  return {
    slug: "una-estacion",
    name: "Una Estación",
    address: null,
    city: "Montevideo",
    department: "Montevideo",
    latitude: -34.9,
    longitude: -56.2,
    presence: "listed",
    connectors: 2,
    operational: 2,
    faulted: 0,
    unknown: 0,
    absent: 0,
    outOfService: 0,
    lastSeenAt: "2026-09-04T19:00:00.000Z",
    ...overrides,
  };
}

function manyStations(count: number): StationStatus[] {
  const departments = ["Montevideo", "Canelones", "Artigas", "Rocha"];
  return Array.from({ length: count }, (_, index) =>
    station({
      slug: `estacion-${index}`,
      name: `Estación ${index}`,
      department: departments[index % departments.length],
    }),
  );
}

function renderIndex(stations: StationStatus[]): string {
  return renderToStaticMarkup(createElement(StationsIndex, { stations }));
}

function linkedSlugs(markup: string): string[] {
  return [...markup.matchAll(/href="\/estaciones\/([^"]+)"/g)].map((match) => match[1]);
}

function dashboard(stations: StationStatus[]): DashboardData {
  return {
    snapshot: {
      stations: { total: stations.length, listed: stations.length, silent: 0, delisted: 0 },
      connectors: {
        reported: 10,
        operational: 10,
        faulted: 0,
        unknown: 0,
        absent: 0,
        outOfService: 0,
      },
      lastSuccessfulPollAt: "2026-09-04T19:00:00.000Z",
    } as DashboardData["snapshot"],
    feed: {
      windowDays: 90,
      polls: 1,
      successes: 1,
      failures: 0,
      successRate: 1,
      distinctPayloads: 1,
      identicalPayloadStreak: 0,
      lastFailureAt: null,
      unchangedSince: null,
    } as DashboardData["feed"],
    departments: [],
    stations,
    reliability: [],
    history: [],
    historyDays: 90,
    reliabilityDays: 30,
  };
}

describe("every station is reachable without a pointing device", () => {
  it("gives each station its own link", () => {
    const stations = manyStations(40);

    expect(new Set(linkedSlugs(renderIndex(stations)))).toEqual(
      new Set(stations.map((entry) => entry.slug)),
    );
  });

  it("renders on the server, so the links exist before any JavaScript runs", () => {
    const source = renderIndex(manyStations(3));

    expect(source).toContain("<li");
    expect(source).toContain("/estaciones/estacion-0");
  });

  it("reaches every station from its own route, not only the ones in the reliability table", async () => {
    const stations = manyStations(251);
    loadStationList.mockResolvedValue(stations);

    const markup = renderToStaticMarkup(await StationsPage());

    expect(new Set(linkedSlugs(markup)).size, "the /estaciones route omits a station").toBe(251);
  });
});

describe("the home page no longer carries the whole list", () => {
  it("points at /estaciones instead of embedding all 251 rows", async () => {
    const stations = manyStations(251);
    loadDashboard.mockResolvedValue(dashboard(stations));

    const markup = renderToStaticMarkup(await DashboardPage());

    expect(markup).toContain('href="/estaciones"');
    expect(
      linkedSlugs(markup).length,
      "the home page grew the full station list back",
    ).toBe(0);
  });
});

describe("the list is navigable rather than a wall of links", () => {
  it("groups by department and orders both the groups and the stations", () => {
    const markup = renderIndex([
      station({ slug: "b-mvd", name: "Zeta", department: "Montevideo" }),
      station({ slug: "a-mvd", name: "Alfa", department: "Montevideo" }),
      station({ slug: "a-art", name: "Uno", department: "Artigas" }),
    ]);

    const headings = [...markup.matchAll(/<h2 class="stations-department-heading">([^<]+)/g)].map(
      (match) => match[1].trim(),
    );
    expect(headings).toEqual(["Artigas", "Montevideo"]);
    expect(linkedSlugs(markup)).toEqual(["a-art", "a-mvd", "b-mvd"]);
  });

  it("keeps the list role the stylesheet reset would otherwise strip", () => {
    expect(renderIndex(manyStations(2))).toContain('role="list"');
  });

  it("says how many stations each department holds", () => {
    const markup = renderIndex([
      station({ slug: "solo", department: "Rocha" }),
      station({ slug: "a", department: "Salto" }),
      station({ slug: "b", department: "Salto" }),
    ]);

    expect(markup).toContain("Rocha");
    expect(markup).toContain("1 estación");
    expect(markup).toContain("Salto");
    expect(markup).toContain("2 estaciones");
  });
});

describe("a station shows without a pointer, and reflows instead of scrolling sideways", () => {
  const CSS = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");

  function blockFor(selector: string): string {
    const start = CSS.indexOf(`\n${selector} {`);
    if (start === -1) throw new Error(`no rule for ${selector} at the top level of the stylesheet`);

    const open = CSS.indexOf("{", start);
    const close = CSS.indexOf("}", open);
    return CSS.slice(open + 1, close);
  }

  it("lets a row wrap rather than forcing horizontal scroll at 320px — WCAG 1.4.10", () => {
    expect(blockFor(".station-index-row")).toMatch(/flex-wrap:\s*wrap/);
  });

  it("names a station that is out of service, and marks it with a glyph", () => {
    const markup = renderIndex([station({ slug: "rota", outOfService: 2, faulted: 2 })]);

    expect(markup).toContain("fuera");
    expect(markup).toContain("✕");
  });

  it("says nothing broke rather than showing a bare zero", () => {
    const markup = renderIndex([station({ slug: "sana", outOfService: 0 })]);

    expect(markup).toContain(">—<");
  });
});

describe("the page shows a notice instead of empty controls when there is nothing to list", () => {
  it("does not render the search row for an empty network", async () => {
    loadStationList.mockResolvedValue([]);

    const markup = renderToStaticMarkup(await StationsPage());

    expect(markup).not.toContain("stations-controls");
    expect(markup).toContain("No hay datos para mostrar");
  });
});
