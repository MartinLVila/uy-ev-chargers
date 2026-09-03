import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ConnectorHistory } from "../src/components/ConnectorHistory";
import type { StationTimelineEntry } from "../src/lib/metrics/queries";

const WINDOW_START = "2026-03-01T00:00:00Z";
const WINDOW_END = "2026-03-02T00:00:00Z";
const MIDDAY = "2026-03-01T12:00:00Z";
const FIVE_MINUTES_LATER = "2026-03-01T12:05:00Z";

const BAR = 'border-radius:999px';

function entry(overrides: Partial<StationTimelineEntry> = {}): StationTimelineEntry {
  return {
    connectorType: "CCS2",
    powerKw: 60,
    hasCable: true,
    statusDetail: "Disponible",
    health: "operational",
    connectorCount: 1,
    startedAt: WINDOW_START,
    endedAt: null,
    ...overrides,
  };
}

function render(timeline: StationTimelineEntry[]): string {
  return renderToStaticMarkup(
    createElement(ConnectorHistory, {
      timeline,
      timelineCoversFrom: null,
      firstSeenAt: WINDOW_START,
      windowStart: WINDOW_START,
      windowEnd: WINDOW_END,
    }),
  );
}

function occurrences(markup: string, needle: string): number {
  return markup.split(needle).length - 1;
}

function leftEdgesOfFirstBar(markup: string): number[] {
  const bar = markup.slice(markup.indexOf(BAR));
  const nextBar = bar.indexOf(BAR, BAR.length);
  const onlyThisBar = nextBar === -1 ? bar : bar.slice(0, nextBar);
  return [...onlyThisBar.matchAll(/left:([\d.]+)%/g)].map((match) => Number(match[1]));
}

describe("ConnectorHistory", () => {
  it("draws a bar for every connector in the bank", () => {
    const markup = render([
      entry({ connectorCount: 3 }),
      entry({ connectorCount: 1, statusDetail: "Faulted", health: "faulted" }),
    ]);

    expect(occurrences(markup, BAR)).toBe(4);
  });

  it("reports use and outage for the bank, never for one of its bars", () => {
    const markup = render([
      entry({ connectorCount: 1, statusDetail: "Ocupado" }),
      entry({ connectorCount: 1 }),
    ]);

    expect(occurrences(markup, "Uso ")).toBe(1);
  });

  it("says the bars carry connectors without naming which", () => {
    const markup = render([entry({ connectorCount: 2 })]);

    expect(markup).toContain("no cuál es cuál");
    expect(markup).toContain("ninguna barra sigue a un cargador");
  });

  it("leaves a lone connector without that caveat", () => {
    const markup = render([entry({ connectorCount: 1 })]);

    expect(markup).not.toContain("no cuál es cuál");
  });

  it("says an empty stretch is a connector the bank did not have yet", () => {
    const markup = render([
      entry({ connectorCount: 2, startedAt: MIDDAY, endedAt: WINDOW_END }),
      entry({ connectorCount: 1, startedAt: WINDOW_START, endedAt: MIDDAY }),
    ]);

    expect(markup).toContain("todavía no tenía");
  });

  it("keeps a brief fault on top of the run that follows it", () => {
    const markup = render([
      entry({ startedAt: WINDOW_START, endedAt: MIDDAY }),
      entry({
        startedAt: MIDDAY,
        endedAt: FIVE_MINUTES_LATER,
        statusDetail: "Faulted",
        health: "faulted",
      }),
      entry({ startedAt: FIVE_MINUTES_LATER, endedAt: WINDOW_END }),
    ]);

    const edges = leftEdgesOfFirstBar(markup);

    expect(edges).toHaveLength(3);
    expect(edges).toEqual([...edges].sort((a, b) => b - a));
  });
});
