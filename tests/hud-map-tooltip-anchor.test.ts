import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HudMapView } from "../src/components/HudMapView";
import { readWithUnixLineEndings } from "./helpers/source-text";
import { tooltipSitsBelow, VIEW_HEIGHT, type LocalityPoint } from "../src/lib/ui/hud-map";

const CSS = readWithUnixLineEndings(new URL("../src/app/globals.css", import.meta.url));
const SOURCE = readWithUnixLineEndings(
  new URL("../src/components/HudMapView.tsx", import.meta.url),
);

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

function markup(): string {
  return renderToStaticMarkup(
    createElement(HudMapView, { points: [point()], paths: [], corridors: [] }),
  );
}

function divEnclosing(text: string, opening: number): string {
  const start = text.lastIndexOf("<", opening);
  let depth = 0;
  for (let index = start; index < text.length; index += 1) {
    if (text.startsWith("<div", index)) depth += 1;
    if (text.startsWith("</div>", index)) {
      depth -= 1;
      if (depth === 0) return text.slice(start, index + "</div>".length);
    }
  }
  throw new Error("the enclosing element is never closed");
}

function renderedCanvas(): string {
  const html = markup();
  const opening = html.indexOf('class="hud-map-canvas"');
  if (opening === -1) throw new Error("nothing rendered carries the class hud-map-canvas");
  return divEnclosing(html, opening);
}

function authoredCanvas(): string {
  const opening = SOURCE.indexOf('className="hud-map-canvas"');
  if (opening === -1) throw new Error("the component declares no hud-map-canvas");
  return divEnclosing(SOURCE, opening);
}

function ruleFor(selector: string): string {
  const at = CSS.indexOf(`\n${selector} {`);
  if (at === -1) throw new Error(`the stylesheet has no rule for ${selector}`);

  const opens = CSS.indexOf("{", at);
  const closes = CSS.indexOf("}", opens);
  if (closes === -1) throw new Error(`the rule for ${selector} is never closed`);
  return CSS.slice(opens + 1, closes);
}

function occurrences(text: string, needle: string): number {
  return text.split(needle).length - 1;
}

describe("a tooltip placed by percentage is measured against the map, not the section around it", () => {
  it("puts every tooltip inside the box the percentages divide by", () => {
    const authored = authoredCanvas();

    expect(occurrences(SOURCE, 'className="hud-tooltip"')).toBe(2);
    expect(
      occurrences(authored, 'className="hud-tooltip"'),
      "a tooltip outside the canvas measures itself against the whole section again",
    ).toBe(2);
  });

  it("puts the map in a box that holds nothing taller than the map", () => {
    const canvas = renderedCanvas();

    expect(canvas, "the canvas does not contain the map").toContain("<svg");
    expect(canvas, "the canvas swallows the fallback list, so it is taller than the map").not.toContain(
      "hud-map-fallback",
    );
    expect(canvas, "the canvas swallows the caption, so it is taller than the map").not.toContain(
      "support-text",
    );
  });

  it("gives that box a position, so a percentage resolves against it", () => {
    expect(ruleFor(".hud-map-canvas")).toMatch(/position:\s*relative/);
    expect(ruleFor(".hud-tooltip")).toMatch(/position:\s*absolute/);
  });

  it("leaves no second positioned ancestor for a tooltip to land in by mistake", () => {
    expect(() => ruleFor(".hud-map-wrap")).toThrow();
    expect(SOURCE).not.toContain("hud-map-wrap");
  });

  it("keeps the fallback list in the section but outside the box the tooltip measures", () => {
    const rendered = markup();

    expect(rendered).toContain("hud-map-fallback");
    expect(rendered.indexOf("hud-map-canvas")).toBeLessThan(rendered.indexOf("hud-map-fallback"));
  });

  it("draws a pointer, so which circle a tooltip describes is not a guess", () => {
    const pointer = ruleFor(".hud-tooltip::after");

    expect(pointer).toMatch(/transform:[^;]*rotate\(45deg\)/);
    expect(pointer, "the pointer sits inside the box instead of below it").toMatch(
      /top:\s*calc\(100%/,
    );
  });

  it("borders the pointer like the box it belongs to, so the two do not disagree", () => {
    const box = ruleFor(".hud-tooltip");
    const pointer = ruleFor(".hud-tooltip::after");

    const borderOfBox = box.match(/border:\s*([^;]+);/)?.[1].trim();
    expect(borderOfBox, "the tooltip declares no border to match").toBeDefined();

    for (const side of ["border-right", "border-bottom"]) {
      expect(pointer).toContain(`${side}: ${borderOfBox}`);
    }
  });
});

describe("a tooltip takes the side of its circle that has room for it", () => {
  it("drops below a circle in the top half and rises above one in the bottom half", () => {
    expect(tooltipSitsBelow(0)).toBe(true);
    expect(tooltipSitsBelow(VIEW_HEIGHT / 2 - 1)).toBe(true);
    expect(tooltipSitsBelow(VIEW_HEIGHT / 2)).toBe(false);
    expect(tooltipSitsBelow(VIEW_HEIGHT)).toBe(false);
  });

  it("asks that question of both the locality tooltip and the corridor one", () => {
    expect(occurrences(authoredCanvas(), "tooltipSitsBelow(")).toBe(2);
  });

  it("offsets by a fixed gap either way, so a taller tooltip does not drift further off", () => {
    expect(ruleFor(".hud-tooltip")).toMatch(/transform:\s*translate\(-50%, calc\(-100% - 10px\)\)/);
    expect(ruleFor(".hud-tooltip[data-below]")).toMatch(/transform:\s*translate\(-50%, 10px\)/);
  });

  it("turns the pointer to face the circle it moved away from", () => {
    const flipped = ruleFor(".hud-tooltip[data-below]::after");

    expect(flipped).toMatch(/bottom:\s*calc\(100% - 6px\)/);
    expect(flipped, "the pointer would keep the top edge it was given for the other side").toMatch(
      /top:\s*auto/,
    );
    expect(flipped).toMatch(/transform:[^;]*rotate\(225deg\)/);
  });
});
