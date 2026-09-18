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

function linksTo(markup: string, href: string): number {
  return [...markup.matchAll(/href="([^"]*)"/g)].filter((match) => match[1] === href).length;
}

describe("the map offers one way into the station list, not two", () => {
  const markup = renderToStaticMarkup(
    createElement(HudMapView, {
      points: [point(), point({ name: "Durazno", department: "Durazno", stationDepartments: ["Durazno"] })],
      paths: [],
      corridors: [],
    }),
  );
  const anchors = [...markup.matchAll(/href="([^"]*)"/g)].map((match) => match[1]);

  it("renders the localities it was given, rather than nothing at all", () => {
    expect(anchors.length, `${anchors.length} links rendered`).toBeGreaterThanOrEqual(2);
  });

  it("sends every locality to its own department, never to the bare list", () => {
    expect(linksTo(markup, "/estaciones"), `${anchors.length} links rendered`).toBe(0);
  });

  it("leaves the home page holding exactly one link to the list", () => {
    const fromHome = [...HOME.matchAll(/href="\/estaciones"/g)].length;

    expect(fromHome, "the map section names the list more than once, or not at all").toBe(1);
  });
});
