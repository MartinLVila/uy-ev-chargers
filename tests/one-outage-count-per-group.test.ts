import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StationTimelineEntry } from "../src/lib/metrics/queries";

const counted = vi.hoisted(() => ({ calls: 0 }));

vi.mock("@/lib/ui/connector-timeline", async (importOriginal) => {
  const timeline = await importOriginal<typeof import("../src/lib/ui/connector-timeline")>();

  return {
    ...timeline,
    daysOutOfService: (group: Parameters<typeof timeline.daysOutOfService>[0]) => {
      counted.calls += 1;
      return timeline.daysOutOfService(group);
    },
  };
});

const { ConnectorHistory } = await import("../src/components/ConnectorHistory");

const WINDOW_START = "2026-03-01T03:00:00Z";
const WINDOW_END = "2026-03-05T03:00:00Z";
const THIRD_DAY = "2026-03-03T03:00:00Z";
const FOURTH_DAY = "2026-03-04T03:00:00Z";

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

function aGroupThatBreaksForADay(overrides: Partial<StationTimelineEntry>): StationTimelineEntry[] {
  return [
    entry({ ...overrides, startedAt: WINDOW_START, endedAt: THIRD_DAY }),
    entry({ ...overrides, statusDetail: "Faulted", health: "faulted", startedAt: THIRD_DAY, endedAt: FOURTH_DAY }),
    entry({ ...overrides, startedAt: FOURTH_DAY, endedAt: WINDOW_END }),
  ];
}

const TWO_GROUPS = [
  ...aGroupThatBreaksForADay({ connectorType: "CCS2", powerKw: 60 }),
  ...aGroupThatBreaksForADay({ connectorType: "Type 2", powerKw: 22 }),
];

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

function headlineCounts(markup: string): string[] {
  return [...markup.matchAll(/>(\d+)<\/strong>\s*(?:día|días) fuera de servicio/g)].map(
    (match) => match[1],
  );
}

function describedCounts(markup: string): string[] {
  return [...markup.matchAll(/en (\d+) (?:día|días) fuera de servicio/g)].map((match) => match[1]);
}

describe("the days out of service are counted once per group", () => {
  beforeEach(() => {
    counted.calls = 0;
  });

  it("walks a group's lanes once, not once per place the count is shown", () => {
    render(TWO_GROUPS);

    expect(counted.calls).toBe(2);
  });

  it("shows the reader and the screen reader the same number", () => {
    const markup = render(TWO_GROUPS);

    expect(headlineCounts(markup)).toEqual(["1", "1"]);
    expect(describedCounts(markup)).toEqual(headlineCounts(markup));
  });
});
