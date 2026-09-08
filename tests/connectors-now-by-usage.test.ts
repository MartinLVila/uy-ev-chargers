import { describe, expect, it } from "vitest";
import { connectorsNow, connectorsNowByUsage } from "../src/lib/ui/health";
import type { StationTimelineEntry } from "../src/lib/metrics/queries";

function entry(overrides: Partial<StationTimelineEntry> = {}): StationTimelineEntry {
  return {
    connectorType: "CCS2",
    powerKw: 50,
    hasCable: true,
    statusDetail: "available",
    health: "operational",
    connectorCount: 1,
    startedAt: "2026-09-01T00:00:00.000Z",
    endedAt: null,
    ...overrides,
  };
}

describe("the live tally distinguishes free from merely healthy", () => {
  it("counts a free connector apart from one that is simply in use", () => {
    const tally = connectorsNowByUsage([
      entry({ statusDetail: "available", connectorCount: 4 }),
      entry({ statusDetail: "charging", connectorCount: 3 }),
    ]);

    expect(tally.free).toBe(4);
    expect(tally.inUse).toBe(3);
    expect(tally.total).toBe(7);
  });

  it("ignores a closed interval, since it is history, not the current state", () => {
    const tally = connectorsNowByUsage([
      entry({ endedAt: "2026-09-02T00:00:00.000Z", connectorCount: 5 }),
    ]);

    expect(tally.total).toBe(0);
  });

  it("counts a faulted connector as broken and an absent one apart from it", () => {
    const tally = connectorsNowByUsage([
      entry({ health: "faulted", statusDetail: "unavailable", connectorCount: 2 }),
      entry({ health: "absent", statusDetail: "absent", connectorCount: 1 }),
    ]);

    expect(tally.broken).toBe(2);
    expect(tally.absent).toBe(1);
  });
});

describe("the coarse tally is the fine tally collapsed, not a second computation", () => {
  it("agrees with the fine-grained tally's own totals", () => {
    const timeline = [
      entry({ statusDetail: "available", connectorCount: 4 }),
      entry({ statusDetail: "charging", connectorCount: 3 }),
      entry({ health: "faulted", statusDetail: "unavailable", connectorCount: 2 }),
      entry({ health: "absent", statusDetail: "absent", connectorCount: 1 }),
    ];

    const fine = connectorsNowByUsage(timeline);
    const coarse = connectorsNow(timeline);

    expect(coarse.total).toBe(fine.total);
    expect(coarse.inService).toBe(fine.free + fine.inUse);
    expect(coarse.outOfService).toBe(fine.broken + fine.absent);
    expect(coarse.unknown).toBe(fine.unknown);
  });
});
