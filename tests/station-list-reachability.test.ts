import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { StationList } from "../src/components/StationList";
import type { DashboardData } from "../src/lib/metrics/dashboard";
import type { StationStatus } from "../src/lib/metrics/queries";

const loadDashboard = vi.hoisted(() => vi.fn());

vi.mock("@/lib/metrics/dashboard", () => ({ loadDashboard }));
vi.mock("@/components/StationMapPanel", () => ({ StationMapPanel: () => null }));

const { default: DashboardPage } = await import("../src/app/page");

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

function renderList(stations: StationStatus[]): string {
  return renderToStaticMarkup(createElement(StationList, { stations }));
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

    expect(new Set(linkedSlugs(renderList(stations)))).toEqual(
      new Set(stations.map((entry) => entry.slug)),
    );
  });

  it("reaches every station from the dashboard, not only the ones in the reliability table", async () => {
    const stations = manyStations(251);
    loadDashboard.mockResolvedValue(dashboard(stations));

    const markup = renderToStaticMarkup(await DashboardPage());

    expect(
      new Set(linkedSlugs(markup)).size,
      "the map is the only route to a station again",
    ).toBe(251);
  });

  it("renders on the server, so it does not need the map or any JavaScript", () => {
    const source = renderList(manyStations(3));

    expect(source).toContain("<li");
    expect(source).toContain("/estaciones/estacion-0");
  });
});

describe("the list is navigable rather than a wall of links", () => {
  it("groups by department and orders both the groups and the stations", () => {
    const markup = renderList([
      station({ slug: "b-mvd", name: "Zeta", department: "Montevideo" }),
      station({ slug: "a-mvd", name: "Alfa", department: "Montevideo" }),
      station({ slug: "a-art", name: "Uno", department: "Artigas" }),
    ]);

    const headings = [...markup.matchAll(/<h3 class="label-caps">([^<·]+)/g)].map((match) =>
      match[1].trim(),
    );
    expect(headings).toEqual(["Artigas", "Montevideo"]);
    expect(linkedSlugs(markup)).toEqual(["a-art", "a-mvd", "b-mvd"]);
  });

  it("keeps the list role the stylesheet reset would otherwise strip", () => {
    expect(renderList(manyStations(2))).toContain('role="list"');
  });

  it("says how many stations each department holds", () => {
    const markup = renderList([
      station({ slug: "solo", department: "Rocha" }),
      station({ slug: "a", department: "Salto" }),
      station({ slug: "b", department: "Salto" }),
    ]);

    expect(markup).toContain("Rocha · 1 estación");
    expect(markup).toContain("Salto · 2 estaciones");
  });

  it("renders nothing at all rather than an empty disclosure", () => {
    expect(renderList([])).toBe("");
  });
});

describe("a row reflows instead of pushing the page sideways", () => {
  const CSS = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");

  function blockFor(selector: string): string {
    const start = CSS.indexOf(`\n${selector} {`);
    if (start === -1) throw new Error(`no rule for ${selector} at the top level of the stylesheet`);

    const open = CSS.indexOf("{", start);
    const close = CSS.indexOf("}", open);
    return CSS.slice(open + 1, close);
  }

  it("lets the meta line wrap, and holds only its own fragments together", () => {
    expect(
      blockFor(".station-row-meta"),
      "a line that cannot wrap forces horizontal scroll at 320px — WCAG 1.4.10",
    ).not.toMatch(/white-space:\s*nowrap/);
    expect(blockFor(".station-row-meta > span")).toMatch(/white-space:\s*nowrap/);
  });

  it("keeps the separators outside the unbreakable fragments", () => {
    const markup = renderList([
      station({ slug: "peor", presence: "delisted", connectors: 12, outOfService: 3 }),
    ]);
    const meta = markup.split('class="station-row-meta"')[1] ?? "";

    expect(
      meta,
      "every space sits inside a nowrap span, so the line has nowhere to break",
    ).toContain("</span> · <span");
  });
});

describe("a station's state survives without colour", () => {
  it("names a station that is out of service, and marks it with a glyph", () => {
    const markup = renderList([station({ slug: "rota", outOfService: 2, connectors: 3 })]);

    expect(markup).toContain("fuera de servicio");
    expect(markup).toContain("✕");
  });

  it("names a station the feed no longer lists", () => {
    const markup = renderList([station({ slug: "ida", presence: "delisted" })]);

    expect(markup).toContain("Fuera del feed");
  });

  it("stays quiet about presence for a station that is simply listed", () => {
    expect(renderList([station()])).not.toContain("En el feed");
  });
});
