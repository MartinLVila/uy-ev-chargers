import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ConnectorHistory } from "../src/components/ConnectorHistory";
import type { StationTimelineEntry } from "../src/lib/metrics/queries";
import { connectorsNow } from "../src/lib/ui/health";

const WINDOW_START = "2026-03-01T03:00:00Z";
const WINDOW_END = "2026-03-05T03:00:00Z";
const SECOND_DAY = "2026-03-02T03:00:00Z";
const THIRD_DAY = "2026-03-03T03:00:00Z";

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

function faulted(overrides: Partial<StationTimelineEntry> = {}): StationTimelineEntry {
  return entry({ statusDetail: "Faulted", health: "faulted", ...overrides });
}

function occurrences(markup: string, needle: string): number {
  return markup.split(needle).length - 1;
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

function overlappingPastOnOneConnector(): StationTimelineEntry[] {
  return [
    faulted({ startedAt: WINDOW_START, endedAt: THIRD_DAY }),
    entry({ startedAt: SECOND_DAY, endedAt: THIRD_DAY }),
    entry({ startedAt: THIRD_DAY, endedAt: null }),
  ];
}

describe("the calendar header counts connectors, not the rows it happens to draw", () => {
  it("agrees with the figure at the top of the page when two states once overlapped", () => {
    const timeline = overlappingPastOnOneConnector();

    expect(connectorsNow(timeline).total).toBe(1);
    expect(render(timeline)).toContain("· 1 conector");
  });

  it("never calls the extra row a connector", () => {
    expect(render(overlappingPastOnOneConnector())).not.toContain("· 2 conectores");
  });

  it("says what the extra row is, since the calendar visibly has one", () => {
    const markup = render(overlappingPastOnOneConnector());

    expect(markup).toContain("dibuja 2 filas");
    expect(markup).toContain("reportó a la vez");
  });

  it("still counts every connector of a bank that never overlapped", () => {
    const timeline = [entry({ connectorCount: 3 })];

    expect(connectorsNow(timeline).total).toBe(3);
    expect(render(timeline)).toContain("· 3 conectores");
  });

  it("leaves a bank whose rows match its connectors without the extra sentence", () => {
    const markup = render([entry({ connectorCount: 3 })]);

    expect(markup).not.toContain("la mayor cantidad de conectores");
  });
});

describe("the calendar never explains its rows two ways at once", () => {
  it("drops the row-per-connector claim when the rows outnumber the connectors", () => {
    const markup = render(overlappingPastOnOneConnector());

    expect(markup).toContain("la mayor cantidad de conectores");
    expect(markup, "the two sentences contradict each other").not.toContain(
      "Hay una fila por conector",
    );
  });

  it("keeps the row-per-connector claim when it is true", () => {
    const markup = render([entry({ connectorCount: 3 })]);

    expect(markup).toContain("Hay una fila por conector");
  });

  it("says it once, not once in the label and again in the sentence it introduces", () => {
    const markup = render([entry({ connectorCount: 3 })]);

    expect(occurrences(markup, "Hay una fila por conector")).toBe(2);
    expect(occurrences(markup, "Una fila por conector.")).toBe(0);
  });

  it("no longer promises one row per connector before the reader reaches the calendar", () => {
    const stationPage = readFileSync(
      new URL("../src/app/estaciones/[slug]/page.tsx", import.meta.url),
      "utf8",
    );

    expect(stationPage).not.toContain("Una fila por conector y una celda por día");
  });
});
