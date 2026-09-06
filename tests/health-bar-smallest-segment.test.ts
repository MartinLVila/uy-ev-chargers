import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  HealthBar,
  NARROWEST_VISIBLE_SEGMENT,
  type HealthSegment,
} from "../src/components/HealthBar";

const FLOOR = `min-width:${NARROWEST_VISIBLE_SEGMENT}px`;

function render(segments: HealthSegment[]): string {
  return renderToStaticMarkup(createElement(HealthBar, { segments }));
}

function sliceBetween(markup: string, opening: string, closing: string): string {
  const start = markup.indexOf(opening);
  const end = markup.indexOf(closing);

  if (start < 0) throw new Error(`the markup has no ${opening}`);
  if (end < start) throw new Error(`the markup has no ${closing} after ${opening}`);

  return markup.slice(start, end);
}

function barOf(markup: string): string {
  return sliceBetween(markup, 'aria-hidden="true"', "<ul");
}

function legendOf(markup: string): string {
  return sliceBetween(markup, "<ul", "</ul>");
}

function drawnSegments(segments: HealthSegment[]): { health: string; style: string }[] {
  const styles = [...barOf(render(segments)).matchAll(/style="([^"]*)"/g)]
    .map((match) => match[1])
    .filter((style) => style.includes("flex-grow"));
  const reported = segments.filter((segment) => segment.count > 0);

  expect(styles).toHaveLength(reported.length);

  return reported.map((segment, index) => ({ health: segment.health, style: styles[index] }));
}

function styleOf(segments: HealthSegment[], health: string): string {
  const drawn = drawnSegments(segments).find((segment) => segment.health === health);

  if (!drawn) throw new Error(`no segment was drawn for ${health}`);

  return drawn.style;
}

const ALMOST_ALL_HEALTHY: HealthSegment[] = [
  { health: "operational", count: 595 },
  { health: "faulted", count: 1 },
];

const TODAYS_FLEET: HealthSegment[] = [
  { health: "operational", count: 554 },
  { health: "faulted", count: 27 },
  { health: "unknown", count: 15 },
];

describe("a bar drawn from counts never draws a nonzero count as nothing", () => {
  it("gives the one broken connector in a fleet of 596 a width it cannot round below", () => {
    expect(styleOf(ALMOST_ALL_HEALTHY, "faulted")).toContain(FLOOR);
  });

  it("gives every drawn segment the same floor, whatever its share", () => {
    for (const segment of drawnSegments(ALMOST_ALL_HEALTHY)) {
      expect(segment.style).toContain(FLOOR);
    }
  });

  it("leaves out the states nobody reported, rather than drawing them at the floor", () => {
    const drawn = drawnSegments([
      ...ALMOST_ALL_HEALTHY,
      { health: "unknown", count: 0 },
      { health: "absent", count: 0 },
    ]);

    expect(drawn.map((segment) => segment.health)).toEqual(["operational", "faulted"]);
  });

  it("still sizes the rest by their share", () => {
    expect(styleOf(TODAYS_FLEET, "operational")).toContain("flex-grow:554");
    expect(styleOf(TODAYS_FLEET, "faulted")).toContain("flex-grow:27");
    expect(styleOf(TODAYS_FLEET, "unknown")).toContain("flex-grow:15");
  });

  it("says the count in words below the bar, so the graphic is never the only record", () => {
    const legend = legendOf(render(ALMOST_ALL_HEALTHY));

    expect(legend).toContain("Con falla");
    expect(legend).toContain(">1<");
  });
});
