import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  ConnectorStateStrip,
  NARROWEST_VISIBLE_FILL,
  type HealthSegment,
} from "../src/components/ConnectorStateStrip";

const FLOOR = `min-width:${NARROWEST_VISIBLE_FILL}px`;

function render(segments: HealthSegment[]): string {
  return renderToStaticMarkup(createElement(ConnectorStateStrip, { segments }));
}

function fillStyles(markup: string): string[] {
  return [...markup.matchAll(/class="strip-bar-fill" style="([^"]*)"/g)].map((match) => match[1]);
}

const TODAYS_FLEET: HealthSegment[] = [
  { health: "operational", count: 554 },
  { health: "faulted", count: 27 },
  { health: "unknown", count: 15 },
  { health: "absent", count: 4 },
];

const ALMOST_ALL_HEALTHY: HealthSegment[] = [
  { health: "operational", count: 595 },
  { health: "faulted", count: 1 },
  { health: "unknown", count: 0 },
  { health: "absent", count: 0 },
];

describe("a cell drawn from a count never draws a nonzero count as an invisible fill", () => {
  it("gives the one broken connector in a fleet of 596 a fill it cannot round below the floor", () => {
    const style = fillStyles(render(ALMOST_ALL_HEALTHY))[1];
    expect(style).toContain(FLOOR);
  });

  it("gives a zero-count cell no floor, since there is nothing to make visible", () => {
    const style = fillStyles(render(ALMOST_ALL_HEALTHY))[2];
    expect(style).toContain("min-width:0");
  });

  it("still fills every cell to its true share, not a share that reads as more than it is", () => {
    const styles = fillStyles(render(TODAYS_FLEET));
    const total = TODAYS_FLEET.reduce((sum, segment) => sum + segment.count, 0);

    TODAYS_FLEET.forEach((segment, index) => {
      const share = (segment.count / total) * 100;
      expect(styles[index]).toContain(`width:${share}%`);
    });
  });

  it("states every count in text, so the fill is never the only record", () => {
    const markup = render(TODAYS_FLEET);

    expect(markup).toContain("Con falla");
    expect(markup).toContain(">27<");
  });

  it("renders every state passed, even one nobody reported", () => {
    const markup = render(ALMOST_ALL_HEALTHY);

    expect(markup.split("<li").length - 1).toBe(4);
  });
});

describe("the strip stays a list Safari will not drop the role from", () => {
  it("announces the connector health breakdown as a list", () => {
    const markup = render(TODAYS_FLEET);

    expect(markup).toContain('role="list"');
    expect(markup.split("<li").length - 1).toBe(4);
  });
});
