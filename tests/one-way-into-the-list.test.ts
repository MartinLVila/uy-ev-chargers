import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HudMapView } from "../src/components/HudMapView";
import { readWithUnixLineEndings } from "./helpers/source-text";
import type { LocalityPoint } from "../src/lib/ui/hud-map";

const HOME = readWithUnixLineEndings(new URL("../src/app/page.tsx", import.meta.url));

function point(overrides: Partial<LocalityPoint> = {}): LocalityPoint {
  return {
    name: "Trinidad",
    department: "Flores",
    stationDepartments: ["Flores"],
    x: 640,
    y: 500,
    radius: 6,
    fleet: 2,
    outOfService: 0,
    observed: true,
    ...overrides,
  };
}

const POINTS = [
  point(),
  point({
    name: "Ciudad de la Costa",
    department: "Canelones",
    stationDepartments: ["Canelones", "Desconocido"],
  }),
  point({ name: "Sin localidad", department: "Rocha", stationDepartments: [] }),
];

function render(points: LocalityPoint[]): string {
  return renderToStaticMarkup(createElement(HudMapView, { points, paths: [], corridors: [] }));
}

function hrefs(markup: string): string[] {
  return [...markup.matchAll(/href="([^"]*)"/g)].map((match) => match[1]);
}

describe("the map names the station list only through the localities it draws", () => {
  it("renders a link for every locality it was given, rather than nothing at all", () => {
    const links = hrefs(render(POINTS));

    expect(links.length, `${POINTS.length} localities, ${links.length} links`).toBeGreaterThanOrEqual(
      POINTS.length,
    );
  });

  it("anchors a locality that belongs to one department at that department", () => {
    const links = hrefs(render([point()]));

    expect(links).toContain("/estaciones#departamento-flores");
  });

  it("adds no bare link of its own beyond the localities that have no single department", () => {
    const links = hrefs(render(POINTS));
    const perLocality = links.length / POINTS.length;
    const spanning = POINTS.filter((locality) => locality.stationDepartments.length !== 1);
    const bare = links.filter((href) => href === "/estaciones");
    const examined = `${POINTS.length} localities, ${links.length} links, ${spanning.length} without one department`;

    expect(Number.isInteger(perLocality), examined).toBe(true);
    expect(bare.length, examined).toBe(spanning.length * perLocality);
  });
});

describe("the home page names the station list once", () => {
  it("links to it exactly once across the page", () => {
    const links = [...HOME.matchAll(/href="\/estaciones"/g)].length;

    expect(links, "the home page names the list more than once, or not at all").toBe(1);
  });
});
