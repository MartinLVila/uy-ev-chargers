import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HudMapView } from "../src/components/HudMapView";
import { readWithUnixLineEndings } from "./helpers/source-text";
import {
  hitRadius,
  localityRadius,
  TARGET_RADIUS,
  VIEW_WIDTH,
  type LocalityPoint,
} from "../src/lib/ui/hud-map";

const CSS = readWithUnixLineEndings(new URL("../src/app/globals.css", import.meta.url));

function ruleFor(selector: string): string {
  const at = CSS.indexOf(`\n${selector} {`);
  if (at === -1) throw new Error(`the stylesheet has no rule for ${selector}`);

  const opens = CSS.indexOf("{", at);
  const closes = CSS.indexOf("}", opens);
  return CSS.slice(opens + 1, closes);
}

function pixels(text: string, pattern: RegExp): number {
  const match = text.match(pattern);
  if (!match) throw new Error(`nothing matched ${pattern}, so the width would be silently wrong`);
  return Number(match[1]);
}

function drawingWidthAtWidest(): number {
  const container = ruleFor(".container");
  const svg = ruleFor(".hud-map-svg");

  const outer = pixels(container, /max-width:\s*(\d+)px/);
  const sidePadding = pixels(container, /padding:\s*\d+ (\d+)px/) * 2;
  const svgBorder = pixels(svg, /border:\s*(\d+)px/) * 2;
  return outer - sidePadding - svgBorder;
}

function point(overrides: Partial<LocalityPoint> = {}): LocalityPoint {
  return {
    name: "Trinidad",
    department: "Flores",
    stationDepartments: ["Flores"],
    x: 640,
    y: 500,
    radius: localityRadius(1),
    fleet: 1,
    outOfService: 0,
    observed: true,
    ...overrides,
  };
}

function markup(points: LocalityPoint[]): string {
  return renderToStaticMarkup(createElement(HudMapView, { points, paths: [], corridors: [] }));
}

function fallbackList(rendered: string): string {
  const opens = rendered.indexOf("hud-map-fallback");
  const closes = rendered.indexOf("</details>", opens);
  if (opens === -1 || closes === -1) throw new Error("the fallback list is not in the markup");
  return rendered.slice(opens, closes);
}

function hitRadiiIn(rendered: string): number[] {
  return [...rendered.matchAll(/class="hud-locality-hit"[^>]*?r="([\d.]+)"/g)].map((m) =>
    Number(m[1]),
  );
}

describe("a lone locality gets the whole target", () => {
  it("is drawn smaller than that target, which is why it needs one", () => {
    const scale = drawingWidthAtWidest() / VIEW_WIDTH;

    expect(
      localityRadius(1) * 2 * scale,
      "the smallest drawn circle already clears the target, so this would be pointless",
    ).toBeLessThan(TARGET_RADIUS * 2);
  });

  it("pins where the drawn circle stops needing help", () => {
    const belowTarget = (connectors: number) => localityRadius(connectors) < TARGET_RADIUS;

    expect(belowTarget(36), "36 connectors is the last fleet drawn below the target").toBe(true);
    expect(belowTarget(37), "37 connectors is the first drawn at or above it").toBe(false);
  });

  it("hands a distant locality the full target radius", () => {
    const here = point({ x: 100 });
    const faraway = point({ name: "Lejos", x: 900 });

    expect(hitRadius(here, [here, faraway])).toBe(TARGET_RADIUS);
  });

  it("measures roughly the minimum in pixels at the widest layout", () => {
    const scale = drawingWidthAtWidest() / VIEW_WIDTH;
    const diameter = TARGET_RADIUS * 2 * scale;

    expect(diameter).toBeGreaterThanOrEqual(23.5);
    expect(diameter).toBeLessThanOrEqual(24);
  });
});

describe("a target never swallows the locality next to it", () => {
  it("stops at half the gap when a neighbour is closer than the target", () => {
    const here = point({ x: 100, radius: 1 });
    const near = point({ name: "Cerca", x: 110, radius: 1 });

    expect(hitRadius(here, [here, near]), "half of a ten-unit gap").toBe(5);
  });

  it("leaves the neighbour's own centre outside it, whichever one is asked", () => {
    const here = point({ x: 100, radius: 1 });
    const near = point({ name: "Cerca", x: 110, radius: 1 });
    const both = [here, near];

    expect(hitRadius(here, both)).toBeLessThan(10);
    expect(hitRadius(near, both)).toBeLessThan(10);
  });

  it("never shrinks below the circle already drawn there", () => {
    const big = point({ x: 100, radius: localityRadius(216), fleet: 216 });
    const near = point({ name: "Cerca", x: 104, radius: 1 });

    expect(hitRadius(big, [big, near])).toBe(big.radius);
  });

  it("takes the nearest neighbour, not the first one it looks at", () => {
    const here = point({ x: 100, radius: 1 });
    const far = point({ name: "Lejos", x: 900, radius: 1 });
    const near = point({ name: "Cerca", x: 106, radius: 1 });

    expect(hitRadius(here, [here, far, near])).toBe(3);
  });
});

describe("the map renders those targets", () => {
  it("gives every locality one", () => {
    const rendered = markup([point(), point({ name: "Otra", x: 200 })]);

    expect(hitRadiiIn(rendered)).toHaveLength(2);
  });

  it("catches the pointer without painting anything", () => {
    const rule = ruleFor(".hud-locality-hit");

    expect(rule).toMatch(/fill:\s*transparent/);
    expect(rule).toMatch(/stroke:\s*none/);
    expect(rule).toMatch(/pointer-events:\s*fill/);
  });

  it("shrinks the pair that sits close together and not the one that does not", () => {
    const crowded = markup([
      point({ name: "A", x: 100, radius: 1 }),
      point({ name: "B", x: 108, radius: 1 }),
      point({ name: "C", x: 900, radius: 1 }),
    ]);

    expect(hitRadiiIn(crowded)).toEqual([4, 4, TARGET_RADIUS]);
  });

  it("leaves the circles in the order the data gave them", () => {
    const rendered = markup([
      point({ name: "Primera", x: 100 }),
      point({ name: "Segunda", x: 300 }),
    ]);

    expect(rendered.indexOf("Primera")).toBeLessThan(rendered.indexOf("Segunda"));
  });
});

describe("the list under the map is a way through, not a caption", () => {
  it("links every locality to the same place its circle does", () => {
    const rendered = markup([point(), point({ name: "Otra", department: "Soriano" })]);

    expect((fallbackList(rendered).match(/href="\/estaciones/g) ?? []).length).toBe(2);
  });

  it("sends a locality to the department its circle sends it to", () => {
    const rendered = markup([point({ department: "Flores", stationDepartments: ["Flores"] })]);
    const inMap = rendered.slice(0, rendered.indexOf("hud-map-fallback"));

    const target = inMap.match(/href="(\/estaciones[^"]*)"/)?.[1];
    expect(target, "the map link has no destination to compare against").toBeDefined();
    expect(fallbackList(rendered)).toContain(`href="${target}"`);
  });

  it("lets the row's own text shrink now that a link wraps it", () => {
    expect(ruleFor(".station-row > *"), "the rule still names the element it replaced").toMatch(
      /min-width:\s*0/,
    );
  });
});
