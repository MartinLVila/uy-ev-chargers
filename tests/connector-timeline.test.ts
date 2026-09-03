import { describe, expect, it } from "vitest";
import {
  buildConnectorTimelines,
  resolveTimelineRange,
  type ConnectorGroupTimeline,
  type TimelineRange,
} from "../src/lib/ui/connector-timeline";
import type { StationTimelineEntry } from "../src/lib/metrics/queries";

const RANGE_START = new Date("2026-03-01T00:00:00Z").getTime();
const RANGE_END = new Date("2026-03-02T00:00:00Z").getTime();
const MIDDAY = "2026-03-01T12:00:00Z";

function entry(overrides: Partial<StationTimelineEntry> = {}): StationTimelineEntry {
  return {
    connectorType: "CCS2",
    powerKw: 60,
    hasCable: true,
    statusDetail: "Disponible",
    health: "operational",
    connectorCount: 1,
    startedAt: "2026-03-01T00:00:00Z",
    endedAt: null,
    ...overrides,
  };
}

function free(count: number, overrides: Partial<StationTimelineEntry> = {}) {
  return entry({
    connectorCount: count,
    statusDetail: "Disponible",
    health: "operational",
    ...overrides,
  });
}

function faulted(count: number, overrides: Partial<StationTimelineEntry> = {}) {
  return entry({
    connectorCount: count,
    statusDetail: "Faulted",
    health: "faulted",
    ...overrides,
  });
}

function charging(count: number, overrides: Partial<StationTimelineEntry> = {}) {
  return entry({
    connectorCount: count,
    statusDetail: "Ocupado",
    health: "operational",
    ...overrides,
  });
}

function statesOf(group: ConnectorGroupTimeline): string[][] {
  return group.lanes.map((lane) => lane.slices.map((slice) => slice.state));
}

function drawnAt(group: ConnectorGroupTimeline, moment: string): Record<string, number> {
  const at = new Date(moment).getTime();
  const tally: Record<string, number> = {};

  for (const lane of group.lanes) {
    const slice = lane.slices.find((candidate) => candidate.from <= at && candidate.to > at);
    if (!slice) continue;
    tally[slice.state] = (tally[slice.state] ?? 0) + 1;
  }

  return tally;
}

describe("buildConnectorTimelines", () => {
  it("gives every connector in a bank a bar of its own", () => {
    const [group] = buildConnectorTimelines([free(3), faulted(1)], RANGE_START, RANGE_END);

    expect(group.lanes).toHaveLength(4);
    expect(group.lanes.map((lane) => lane.position)).toEqual([1, 2, 3, 4]);
  });

  it("keeps a fault on a bar of its own rather than stacked over a free connector", () => {
    const [group] = buildConnectorTimelines([free(3), faulted(1)], RANGE_START, RANGE_END);

    expect(statesOf(group)).toEqual([["broken"], ["free"], ["free"], ["free"]]);
  });

  it("shows exactly the states that were observed at any moment it draws", () => {
    const [group] = buildConnectorTimelines(
      [
        free(2, { startedAt: "2026-03-01T00:00:00Z", endedAt: MIDDAY }),
        charging(1, { startedAt: "2026-03-01T00:00:00Z", endedAt: MIDDAY }),
        free(1, { startedAt: MIDDAY, endedAt: "2026-03-02T00:00:00Z" }),
        faulted(2, { startedAt: MIDDAY, endedAt: "2026-03-02T00:00:00Z" }),
      ],
      RANGE_START,
      RANGE_END,
    );

    expect(drawnAt(group, "2026-03-01T06:00:00Z")).toEqual({ free: 2, inUse: 1 });
    expect(drawnAt(group, "2026-03-01T18:00:00Z")).toEqual({ broken: 2, free: 1 });
  });

  it("is not affected by the order the entries arrive in", () => {
    const [ascending] = buildConnectorTimelines([free(3), faulted(1)], RANGE_START, RANGE_END);
    const [descending] = buildConnectorTimelines([faulted(1), free(3)], RANGE_START, RANGE_END);

    expect(descending.lanes).toEqual(ascending.lanes);
  });

  it("leaves a connector that never changed as one unbroken bar", () => {
    const [group] = buildConnectorTimelines(
      [
        free(2, { startedAt: "2026-03-01T00:00:00Z", endedAt: MIDDAY }),
        free(1, { startedAt: MIDDAY, endedAt: "2026-03-02T00:00:00Z" }),
        faulted(1, { startedAt: MIDDAY, endedAt: "2026-03-02T00:00:00Z" }),
      ],
      RANGE_START,
      RANGE_END,
    );

    expect(statesOf(group)).toEqual([["free"], ["free", "broken"]]);
    expect(group.lanes[0].slices[0].widthPct).toBeCloseTo(100, 6);
  });

  it("starts the fault where it was first reported", () => {
    const [group] = buildConnectorTimelines(
      [
        free(2, { startedAt: "2026-03-01T00:00:00Z", endedAt: MIDDAY }),
        free(1, { startedAt: MIDDAY, endedAt: "2026-03-02T00:00:00Z" }),
        faulted(1, { startedAt: MIDDAY, endedAt: "2026-03-02T00:00:00Z" }),
      ],
      RANGE_START,
      RANGE_END,
    );

    const [, broken] = group.lanes[1].slices;
    expect(broken.leftPct).toBeCloseTo(50, 6);
    expect(broken.widthPct).toBeCloseTo(50, 6);
  });

  it("counts a bar's time for one connector rather than for the whole bank", () => {
    const [group] = buildConnectorTimelines([free(3)], RANGE_START, RANGE_END);

    for (const lane of group.lanes) {
      expect(lane.seconds.free).toBeCloseTo(24 * 3600, 6);
    }
    expect(group.seconds.free).toBeCloseTo(3 * 24 * 3600, 6);
  });

  it("reports the bank size at the most recent moment rather than one entry of it", () => {
    const [group] = buildConnectorTimelines([free(3), faulted(1)], RANGE_START, RANGE_END);

    expect(group.connectors).toBe(4);
  });

  it("keeps a bar for a connector that has since disappeared, empty where it was gone", () => {
    const [group] = buildConnectorTimelines(
      [
        free(2, { startedAt: "2026-03-01T00:00:00Z", endedAt: MIDDAY }),
        free(1, { startedAt: MIDDAY, endedAt: "2026-03-02T00:00:00Z" }),
      ],
      RANGE_START,
      RANGE_END,
    );

    expect(group.lanes).toHaveLength(2);
    expect(group.connectors).toBe(1);
    expect(group.lanes[1].slices).toHaveLength(1);
    expect(group.lanes[1].slices[0].widthPct).toBeCloseTo(50, 6);
  });

  it("clips an interval that starts before the window", () => {
    const [group] = buildConnectorTimelines(
      [free(1, { startedAt: "2026-02-01T00:00:00Z", endedAt: MIDDAY })],
      RANGE_START,
      RANGE_END,
    );

    expect(group.lanes[0].slices[0].leftPct).toBeCloseTo(0, 6);
    expect(group.lanes[0].slices[0].widthPct).toBeCloseTo(50, 6);
    expect(group.seconds.free).toBeCloseTo(12 * 3600, 6);
  });

  it("drops a group the feed reported with no connectors at all", () => {
    const groups = buildConnectorTimelines([free(0)], RANGE_START, RANGE_END);

    expect(groups).toEqual([]);
  });

  it("drops an interval that falls entirely outside the window", () => {
    const groups = buildConnectorTimelines(
      [entry({ startedAt: "2026-01-01T00:00:00Z", endedAt: "2026-01-02T00:00:00Z" })],
      RANGE_START,
      RANGE_END,
    );

    expect(groups).toHaveLength(0);
  });

  it("keeps separate connector types in separate groups", () => {
    const groups = buildConnectorTimelines(
      [entry({ connectorType: "CCS2" }), entry({ connectorType: "Tipo 2", powerKw: 22 })],
      RANGE_START,
      RANGE_END,
    );

    expect(groups.map((group) => group.connectorType)).toEqual(["CCS2", "Tipo 2"]);
  });
});

const WINDOW_START = "2026-01-01T00:00:00Z";
const WINDOW_END = "2026-04-01T00:00:00Z";
const FIRST_SEEN = "2025-06-01T00:00:00Z";

function resolvedRange(coversFrom: string | null): TimelineRange {
  const range = resolveTimelineRange(coversFrom, FIRST_SEEN, WINDOW_START, WINDOW_END);
  if (range === null) throw new Error("expected the fixture window to resolve");
  return range;
}

describe("resolveTimelineRange", () => {
  it("spans the whole window when the timeline covers all of it", () => {
    const range = resolvedRange(null);

    expect(range.start).toBe(new Date(WINDOW_START).getTime());
    expect(range.end).toBe(new Date(WINDOW_END).getTime());
    expect(range.clampedByRowLimit).toBe(false);
  });

  it("starts where the timeline stops being trustworthy", () => {
    const range = resolvedRange("2026-02-15T00:00:00Z");

    expect(range.start).toBe(new Date("2026-02-15T00:00:00Z").getTime());
    expect(range.clampedByRowLimit).toBe(true);
  });

  it("leaves the window alone when coverage already reaches back past it", () => {
    const range = resolvedRange("2025-12-01T00:00:00Z");

    expect(range.start).toBe(new Date(WINDOW_START).getTime());
    expect(range.clampedByRowLimit).toBe(false);
  });

  it("starts when the station was first seen if that falls inside the window", () => {
    const range = resolveTimelineRange(null, "2026-02-01T00:00:00Z", WINDOW_START, WINDOW_END);

    expect(range?.start).toBe(new Date("2026-02-01T00:00:00Z").getTime());
  });

  it("ignores a coverage boundary it cannot parse rather than clamping to nothing", () => {
    const range = resolvedRange("no es una fecha");

    expect(range.start).toBe(new Date(WINDOW_START).getTime());
    expect(range.clampedByRowLimit).toBe(false);
  });

  it("resolves nothing when the window bounds cannot be parsed", () => {
    expect(resolveTimelineRange(null, FIRST_SEEN, "no es una fecha", WINDOW_END)).toBeNull();
  });

  it("draws a clamped history across the full bar instead of leaving the older part blank", () => {
    const timeline = [entry({ startedAt: "2026-02-15T00:00:00Z", endedAt: null })];
    const range = resolvedRange("2026-02-15T00:00:00Z");

    const [group] = buildConnectorTimelines(timeline, range.start, range.end);

    expect(group.lanes[0].slices).toHaveLength(1);
    expect(group.lanes[0].slices[0].leftPct).toBeCloseTo(0, 6);
    expect(group.lanes[0].slices[0].widthPct).toBeCloseTo(100, 6);
  });
});
