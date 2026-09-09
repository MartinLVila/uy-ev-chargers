import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HistoryChart } from "../src/components/HistoryChart";
import { buildHistoryWindow, historyWindowCoverage, HISTORY_CHART_DAYS } from "../src/lib/ui/history-window";
import type { DailyPoint } from "../src/lib/metrics/queries";

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

describe("the chart has no gestures at all, so the page keeps its scroll and pinch", () => {
  const SOURCE = readFileSync(new URL("../src/components/HistoryChart.tsx", import.meta.url), "utf8");

  it("attaches no pointer, touch or key handling, since every value is already printed", () => {
    expect(SOURCE).not.toMatch(/onPointer|onTouch|onKeyDown|onWheel/i);
  });

  it("is not a client component, since it has no interaction to run", () => {
    expect(SOURCE).not.toContain('"use client"');
  });
});

describe("the chart says where its numbers are", () => {
  const slots = buildHistoryWindow([
    day({ day: "2026-03-01", outOfServiceRatio: 0.01 }),
    day({ day: "2026-03-02", outOfServiceRatio: 0.07 }),
    day({ day: "2026-03-03", outOfServiceRatio: 0.02 }),
  ]);

  function render(): string {
    return renderToStaticMarkup(createElement(HistoryChart, { slots }));
  }

  it("prints every value above its own bar, not just on hover", () => {
    expect(render()).toContain(">7,0%<");
  });

  it("keeps the table-shaped alternative for browse mode", () => {
    expect(render()).toContain("<caption>Porcentaje de conectores fuera de servicio por día</caption>");
  });

  it("announces the day count and its worst day up front", () => {
    expect(render()).toContain("El peor día fue el");
  });
});

describe("the bar scale comes from what the window actually saw, not a fixed ceiling", () => {
  it("draws the worst day's bar at full height regardless of how large it is", () => {
    const slots = buildHistoryWindow([
      day({ day: "2026-03-01", outOfServiceRatio: 0.04 }),
      day({ day: "2026-03-02", outOfServiceRatio: 0.4 }),
    ]);

    const markup = renderToStaticMarkup(createElement(HistoryChart, { slots }));

    expect(markup).toContain("height:100%");
  });
});

describe("the bar colour reflects how bad that day was, not a single fixed colour", () => {
  it("colours a good day, a warning day and a bad day differently", () => {
    const slots = buildHistoryWindow([
      day({ day: "2026-03-01", outOfServiceRatio: 0.02 }),
      day({ day: "2026-03-02", outOfServiceRatio: 0.08 }),
      day({ day: "2026-03-03", outOfServiceRatio: 0.1 }),
    ]);

    const markup = renderToStaticMarkup(createElement(HistoryChart, { slots }));

    expect(markup).toContain("var(--status-good)");
    expect(markup).toContain("var(--status-warning)");
    expect(markup).toContain("var(--status-critical)");
  });
});

describe("a day with no reading is drawn as a gap, not as zero", () => {
  it("marks a missing calendar day as a gap slot rather than inventing a zero", () => {
    const slots = buildHistoryWindow([
      day({ day: "2026-03-01", connectorsOutOfService: 5 }),
      day({ day: "2026-03-03", connectorsOutOfService: 5 }),
    ]);

    expect(slots).toHaveLength(HISTORY_CHART_DAYS);
    const middle = slots.find((slot) => slot.day === "2026-03-02");
    expect(middle?.point).toBeNull();
  });

  it("renders a gap slot without a value or a coloured fill", () => {
    const slots = buildHistoryWindow([
      day({ day: "2026-03-01", connectorsOutOfService: 5 }),
      day({ day: "2026-03-03", connectorsOutOfService: 5 }),
    ]);
    const markup = renderToStaticMarkup(createElement(HistoryChart, { slots }));

    expect(markup).toContain("history-bar-gap");
  });

  it("does not count a gap day toward how many days are covered", () => {
    const slots = buildHistoryWindow([
      day({ day: "2026-03-01", connectorsOutOfService: 5 }),
      day({ day: "2026-03-03", connectorsOutOfService: 5 }),
    ]);

    expect(historyWindowCoverage(slots)).toBe(2);
  });
});

describe("the window is always fifteen calendar days ending on the last reading", () => {
  it("fills exactly fifteen slots even when the series holds only one day", () => {
    const slots = buildHistoryWindow([day({ day: "2026-03-01" })]);

    expect(slots).toHaveLength(HISTORY_CHART_DAYS);
    expect(slots[slots.length - 1].day).toBe("2026-03-01");
    expect(slots[0].day).toBe("2026-02-15");
  });

  it("is empty when there is no history at all", () => {
    expect(buildHistoryWindow([])).toEqual([]);
  });
});
