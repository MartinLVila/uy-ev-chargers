import { describe, expect, it } from "vitest";
import {
  buildConnectorTimelines,
  resolveTimelineRange,
  type TimelineRange,
} from "../src/lib/ui/connector-timeline";
import type { StationTimelineEntry } from "../src/lib/metrics/queries";

const RANGE_START = new Date("2026-03-01T00:00:00Z").getTime();
const RANGE_END = new Date("2026-03-02T00:00:00Z").getTime();

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

describe("buildConnectorTimelines", () => {
  it("keeps a fault visible alongside a free connector in the same bank", () => {
    const [group] = buildConnectorTimelines(
      [
        entry({ connectorCount: 3, statusDetail: "Disponible", health: "operational" }),
        entry({ connectorCount: 1, statusDetail: "Faulted", health: "faulted" }),
      ],
      RANGE_START,
      RANGE_END,
    );

    expect(group.slices).toHaveLength(1);
    const states = group.slices[0].bands.map((band) => band.state);
    expect(states).toContain("broken");
    expect(states).toContain("free");
  });

  it("sizes each band by its share of the bank", () => {
    const [group] = buildConnectorTimelines(
      [
        entry({ connectorCount: 3, statusDetail: "Disponible", health: "operational" }),
        entry({ connectorCount: 1, statusDetail: "Faulted", health: "faulted" }),
      ],
      RANGE_START,
      RANGE_END,
    );

    const bands = new Map(group.slices[0].bands.map((band) => [band.state, band]));
    expect(bands.get("free")?.sharePct).toBeCloseTo(75, 6);
    expect(bands.get("broken")?.sharePct).toBeCloseTo(25, 6);
    expect(group.slices[0].connectors).toBe(4);
  });

  it("is not affected by the order the entries arrive in", () => {
    const free = entry({ connectorCount: 3, statusDetail: "Disponible", health: "operational" });
    const faulted = entry({ connectorCount: 1, statusDetail: "Faulted", health: "faulted" });

    const [ascending] = buildConnectorTimelines([free, faulted], RANGE_START, RANGE_END);
    const [descending] = buildConnectorTimelines([faulted, free], RANGE_START, RANGE_END);

    expect(descending.slices).toEqual(ascending.slices);
  });

  it("splits the bar where the mix changes", () => {
    const [group] = buildConnectorTimelines(
      [
        entry({
          connectorCount: 2,
          statusDetail: "Disponible",
          health: "operational",
          startedAt: "2026-03-01T00:00:00Z",
          endedAt: "2026-03-02T00:00:00Z",
        }),
        entry({
          connectorCount: 1,
          statusDetail: "Faulted",
          health: "faulted",
          startedAt: "2026-03-01T12:00:00Z",
          endedAt: "2026-03-02T00:00:00Z",
        }),
      ],
      RANGE_START,
      RANGE_END,
    );

    expect(group.slices).toHaveLength(2);
    expect(group.slices[0].connectors).toBe(2);
    expect(group.slices[0].bands.map((band) => band.state)).toEqual(["free"]);
    expect(group.slices[1].connectors).toBe(3);
    expect(group.slices[1].bands.map((band) => band.state)).toEqual(["broken", "free"]);
    expect(group.slices[1].leftPct).toBeCloseTo(50, 6);
  });

  it("reports the bank size at the most recent slice rather than one entry of it", () => {
    const [group] = buildConnectorTimelines(
      [
        entry({ connectorCount: 3, statusDetail: "Disponible", health: "operational" }),
        entry({ connectorCount: 1, statusDetail: "Faulted", health: "faulted" }),
      ],
      RANGE_START,
      RANGE_END,
    );

    expect(group.connectors).toBe(4);
  });

  it("clips an interval that starts before the window", () => {
    const [group] = buildConnectorTimelines(
      [
        entry({
          connectorCount: 1,
          startedAt: "2026-02-01T00:00:00Z",
          endedAt: "2026-03-01T12:00:00Z",
        }),
      ],
      RANGE_START,
      RANGE_END,
    );

    expect(group.slices[0].leftPct).toBeCloseTo(0, 6);
    expect(group.slices[0].widthPct).toBeCloseTo(50, 6);
    expect(group.seconds.free).toBeCloseTo(12 * 3600, 6);
  });

  it("drops an interval that falls entirely outside the window", () => {
    const groups = buildConnectorTimelines(
      [
        entry({
          startedAt: "2026-01-01T00:00:00Z",
          endedAt: "2026-01-02T00:00:00Z",
        }),
      ],
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

function resolvedRange(timeline: StationTimelineEntry[], truncated: boolean): TimelineRange {
  const range = resolveTimelineRange(timeline, truncated, FIRST_SEEN, WINDOW_START, WINDOW_END);
  if (range === null) throw new Error("expected the fixture window to resolve");
  return range;
}

describe("resolveTimelineRange", () => {
  it("spans the whole window when the history was not truncated", () => {
    const range = resolvedRange([entry({ startedAt: "2026-03-01T00:00:00Z" })], false);

    expect(range.start).toBe(new Date(WINDOW_START).getTime());
    expect(range.end).toBe(new Date(WINDOW_END).getTime());
    expect(range.clampedByRowLimit).toBe(false);
  });

  it("starts at the oldest retained change when the row limit cut the history short", () => {
    const range = resolvedRange(
      [
        entry({ startedAt: "2026-03-01T00:00:00Z" }),
        entry({ startedAt: "2026-02-15T00:00:00Z" }),
        entry({ startedAt: "2026-03-20T00:00:00Z" }),
      ],
      true,
    );

    expect(range.start).toBe(new Date("2026-02-15T00:00:00Z").getTime());
    expect(range.clampedByRowLimit).toBe(true);
  });

  it("leaves the window alone when the retained history already reaches back past it", () => {
    const range = resolvedRange([entry({ startedAt: "2025-12-01T00:00:00Z" })], true);

    expect(range.start).toBe(new Date(WINDOW_START).getTime());
    expect(range.clampedByRowLimit).toBe(false);
  });

  it("starts when the station was first seen if that falls inside the window", () => {
    const range = resolveTimelineRange([], false, "2026-02-01T00:00:00Z", WINDOW_START, WINDOW_END);

    expect(range?.start).toBe(new Date("2026-02-01T00:00:00Z").getTime());
  });

  it("resolves nothing when the window bounds cannot be parsed", () => {
    expect(resolveTimelineRange([], false, FIRST_SEEN, "no es una fecha", WINDOW_END)).toBeNull();
  });

  it("draws a truncated history across the full bar instead of leaving the older part blank", () => {
    const timeline = [entry({ startedAt: "2026-02-15T00:00:00Z", endedAt: null })];
    const range = resolvedRange(timeline, true);

    const [group] = buildConnectorTimelines(timeline, range.start, range.end);

    expect(group.slices).toHaveLength(1);
    expect(group.slices[0].leftPct).toBeCloseTo(0, 6);
    expect(group.slices[0].widthPct).toBeCloseTo(100, 6);
  });
});
