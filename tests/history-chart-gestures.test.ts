import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HistoryChart } from "../src/components/HistoryChart";
import type { DailyPoint } from "../src/lib/metrics/queries";
import {
  isSpoken,
  readingAt,
  readingStepped,
  readingUnderPointer,
} from "../src/lib/ui/chart-reading";

function day(overrides: Partial<DailyPoint> = {}): DailyPoint {
  return {
    day: "2026-03-01",
    connectorsTracked: 100,
    connectorsAbsent: 0,
    connectorsOutOfService: 3,
    outOfServiceRatio: 0.03,
    stationsDelisted: 0,
    ...overrides,
  };
}

function render(): string {
  return renderToStaticMarkup(
    createElement(HistoryChart, {
      series: [
        day({ day: "2026-03-01", connectorsOutOfService: 1 }),
        day({ day: "2026-03-02", connectorsOutOfService: 7 }),
        day({ day: "2026-03-03", connectorsOutOfService: 2 }),
      ],
    }),
  );
}

describe("the chart leaves the page's own gestures alone", () => {
  it("keeps vertical scrolling, so a swipe that lands on it still moves the page", () => {
    expect(render()).toContain("touch-action:pan-y pinch-zoom");
  });

  it("keeps pinch-zoom, which pan-y alone would take away", () => {
    expect(
      render(),
      "a low-vision reader has to be able to magnify the graphic",
    ).toContain("pinch-zoom");
  });
});

describe("the chart says where its numbers are", () => {
  it("points at the table, the route that survives browse mode", () => {
    expect(render()).toContain("están en la tabla que sigue");
  });

  it("has the table it points at", () => {
    expect(render()).toContain("<caption>Conectores fuera de servicio por día</caption>");
  });

  it("starts with nothing announced", () => {
    expect(render()).toMatch(/aria-live="polite"[^>]*><\/div>/);
  });
});

describe("a reading taken with the pointer", () => {
  it("is the same reading when the pointer has not left the day it was on", () => {
    const current = readingUnderPointer(null, 4);

    expect(readingUnderPointer(current, 4)).toBe(current);
  });

  it("is a new reading once the pointer crosses into another day", () => {
    const current = readingUnderPointer(null, 4);

    expect(readingUnderPointer(current, 5)).not.toBe(current);
    expect(readingUnderPointer(current, 5).index).toBe(5);
  });

  it("is never announced", () => {
    expect(isSpoken(readingUnderPointer(null, 4))).toBe(false);
  });

  it("takes over from a spoken reading rather than keeping it announced", () => {
    const spokenHere = readingAt(4, 9);

    const swept = readingUnderPointer(spokenHere, 4);

    expect(swept).not.toBe(spokenHere);
    expect(isSpoken(swept)).toBe(false);
  });
});

describe("a reading taken with the keyboard", () => {
  it("is announced", () => {
    expect(isSpoken(readingAt(3, 9))).toBe(true);
    expect(isSpoken(readingStepped(readingAt(3, 9), 1, 9))).toBe(true);
  });

  it("steps from the day it is on", () => {
    expect(readingStepped(readingAt(3, 9), 2, 9).index).toBe(5);
  });

  it("starts at the last day when nothing was read yet", () => {
    expect(readingStepped(null, -1, 9).index).toBe(9);
  });

  it("stops at both ends instead of running off them", () => {
    expect(readingStepped(readingAt(0, 9), -5, 9).index).toBe(0);
    expect(readingStepped(readingAt(9, 9), 5, 9).index).toBe(9);
  });
});

describe("nothing is announced without a reading", () => {
  it("says nothing for no reading at all", () => {
    expect(isSpoken(null)).toBe(false);
  });
});
