import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ConnectorHistory } from "../src/components/ConnectorHistory";
import type { StationTimelineEntry } from "../src/lib/metrics/queries";

const WINDOW_START = "2026-03-01T03:00:00Z";
const WINDOW_END = "2026-03-05T03:00:00Z";
const DAYS_IN_WINDOW = 4;

const SECOND_DAY = "2026-03-02T03:00:00Z";
const THIRD_DAY = "2026-03-03T03:00:00Z";
const FOURTH_DAY = "2026-03-04T03:00:00Z";
const TEN_MINUTES_INTO_THE_SECOND_DAY = "2026-03-02T03:10:00Z";

const DAY_CELL = "height:16px";
const NOTHING_OBSERVED = "inset 0 0 0 1px var(--text-muted)";
const BRIEF_OUTAGE = "border-bottom:3px solid var(--day-out)";
const OUT_OF_SERVICE_FILL = "background:var(--day-out)";
const FREE_FILL = "background:var(--day-free)";
const ABSENT_FILL = "background:var(--day-absent)";

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

function calendarOf(markup: string): string {
  const legend = markup.indexOf("width:14px");
  return legend === -1 ? markup : markup.slice(0, legend);
}

describe("ConnectorHistory", () => {
  it("draws one cell per day for every connector in the bank", () => {
    const markup = render([entry({ connectorCount: 3 })]);

    expect(occurrences(calendarOf(markup), DAY_CELL)).toBe(3 * DAYS_IN_WINDOW);
  });

  it("fills a day the connector spent out of service", () => {
    const markup = render([
      entry({ startedAt: WINDOW_START, endedAt: THIRD_DAY }),
      faulted({ startedAt: THIRD_DAY, endedAt: FOURTH_DAY }),
      entry({ startedAt: FOURTH_DAY, endedAt: WINDOW_END }),
    ]);

    expect(occurrences(calendarOf(markup), OUT_OF_SERVICE_FILL)).toBe(1);
  });

  it("marks a day that broke briefly without painting the whole day as broken", () => {
    const markup = render([
      entry({ startedAt: WINDOW_START, endedAt: SECOND_DAY }),
      faulted({ startedAt: SECOND_DAY, endedAt: TEN_MINUTES_INTO_THE_SECOND_DAY }),
      entry({ startedAt: TEN_MINUTES_INTO_THE_SECOND_DAY, endedAt: WINDOW_END }),
    ]);

    expect(occurrences(calendarOf(markup), BRIEF_OUTAGE)).toBe(1);
    expect(occurrences(calendarOf(markup), OUT_OF_SERVICE_FILL)).toBe(0);
    expect(occurrences(calendarOf(markup), FREE_FILL)).toBe(DAYS_IN_WINDOW);
  });

  it("never paints a connector the feed stopped reporting as a fault", () => {
    const markup = render([
      entry({ startedAt: WINDOW_START, endedAt: THIRD_DAY }),
      entry({
        startedAt: THIRD_DAY,
        endedAt: FOURTH_DAY,
        statusDetail: "Sin reportar",
        health: "absent",
      }),
      entry({ startedAt: FOURTH_DAY, endedAt: WINDOW_END }),
    ]);

    expect(occurrences(calendarOf(markup), ABSENT_FILL)).toBe(1);
    expect(occurrences(calendarOf(markup), OUT_OF_SERVICE_FILL)).toBe(0);
  });

  it("still counts a day nobody reported as a day out of service", () => {
    const markup = render([
      entry({ startedAt: WINDOW_START, endedAt: THIRD_DAY }),
      entry({
        startedAt: THIRD_DAY,
        endedAt: FOURTH_DAY,
        statusDetail: "Sin reportar",
        health: "absent",
      }),
      entry({ startedAt: FOURTH_DAY, endedAt: WINDOW_END }),
    ]);

    expect(markup).toContain("1</strong> día fuera de servicio");
    expect(markup).toContain("Sin reportar");
  });

  it("gives an evenly split day to the fault rather than to the good half", () => {
    const noon = "2026-03-02T15:00:00Z";
    const markup = render([
      entry({ startedAt: WINDOW_START, endedAt: noon }),
      faulted({ startedAt: noon, endedAt: THIRD_DAY }),
      entry({ startedAt: THIRD_DAY, endedAt: WINDOW_END }),
    ]);

    expect(occurrences(calendarOf(markup), OUT_OF_SERVICE_FILL)).toBe(1);
  });

  it("leaves a day nobody observed empty rather than colouring it", () => {
    const markup = render([entry({ startedAt: WINDOW_START, endedAt: THIRD_DAY })]);

    expect(occurrences(calendarOf(markup), NOTHING_OBSERVED)).toBe(2);
  });

  it("dates the calendar with the month each row runs through", () => {
    const markup = render([entry()]);

    expect(markup).toContain("mar");
  });

  it("reports use and outage for the bank, never for one of its rows", () => {
    const markup = render([entry({ connectorCount: 2 })]);

    expect(occurrences(markup, "Uso ")).toBe(1);
  });

  it("says the rows carry connectors without naming which", () => {
    const markup = render([entry({ connectorCount: 2 })]);

    expect(markup).toContain("no cuál es cuál");
    expect(markup).toContain("ninguna fila sigue a un cargador");
  });

  it("leaves a lone connector without that caveat", () => {
    const markup = render([entry({ connectorCount: 1 })]);

    expect(markup).not.toContain("no cuál es cuál");
  });

  it("counts the days out of service rather than making the reader find them", () => {
    const markup = render([
      entry({ startedAt: WINDOW_START, endedAt: THIRD_DAY }),
      faulted({ startedAt: THIRD_DAY, endedAt: FOURTH_DAY }),
      entry({ startedAt: FOURTH_DAY, endedAt: WINDOW_END }),
    ]);

    expect(markup).toContain("1</strong> día fuera de servicio");
  });

  it("counts a day once however many connectors broke on it", () => {
    const markup = render([
      entry({ connectorCount: 2, startedAt: WINDOW_START, endedAt: THIRD_DAY }),
      faulted({ connectorCount: 2, startedAt: THIRD_DAY, endedAt: FOURTH_DAY }),
      entry({ connectorCount: 2, startedAt: FOURTH_DAY, endedAt: WINDOW_END }),
    ]);

    expect(occurrences(calendarOf(markup), OUT_OF_SERVICE_FILL)).toBe(2);
    expect(markup).toContain("1</strong> día fuera de servicio");
  });

  it("says so plainly when nothing ever broke", () => {
    const markup = render([entry()]);

    expect(markup).toContain("Sin días fuera de servicio");
  });
});
