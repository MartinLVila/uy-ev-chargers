import { describe, expect, it } from "vitest";
import type { StationTimelineEntry } from "../src/lib/metrics/queries";
import { connectorsNow } from "../src/app/estaciones/[slug]/page";

function entry(overrides: Partial<StationTimelineEntry>): StationTimelineEntry {
  return {
    connectorType: "Tipo 2",
    powerKw: 22,
    hasCable: false,
    statusDetail: "available",
    health: "operational",
    connectorCount: 1,
    startedAt: "2026-08-01T00:00:00.000Z",
    endedAt: null,
    ...overrides,
  };
}

describe("the figures on a station describe the connectors it has open right now", () => {
  it("counts only intervals that have not ended", () => {
    const now = connectorsNow([
      entry({ connectorCount: 2 }),
      entry({ connectorCount: 7, endedAt: "2026-08-20T00:00:00.000Z" }),
    ]);

    expect(now.total).toBe(2);
    expect(now.inService).toBe(2);
  });

  it("splits in service from out of service", () => {
    const now = connectorsNow([
      entry({ connectorCount: 3, health: "operational", statusDetail: "available" }),
      entry({ connectorCount: 2, health: "operational", statusDetail: "charging" }),
      entry({ connectorCount: 4, health: "faulted", statusDetail: "faulted" }),
      entry({ connectorCount: 1, health: "absent", statusDetail: "absent" }),
    ]);

    expect(now.inService).toBe(5);
    expect(now.outOfService).toBe(5);
    expect(now.unknown).toBe(0);
  });

  it("never loses a connector whose state it cannot classify", () => {
    const now = connectorsNow([
      entry({ connectorCount: 4, health: "operational", statusDetail: "available" }),
      entry({ connectorCount: 3, health: "something UTE has not published before" }),
      entry({ connectorCount: 2, health: "faulted", statusDetail: "faulted" }),
    ]);

    expect(now.unknown).toBe(3);
    expect(now.inService + now.outOfService + now.unknown).toBe(now.total);
  });

  it("keeps the buckets a partition of the total for any mix of states", () => {
    const mixes = [
      ["operational", "available"],
      ["operational", "charging"],
      ["faulted", "faulted"],
      ["absent", "absent"],
      ["unheard-of", "unheard-of"],
      ["operational", "a detail nobody mapped"],
    ] as const;

    const now = connectorsNow(
      mixes.map(([health, statusDetail], index) =>
        entry({ health, statusDetail, connectorCount: index + 1 }),
      ),
    );

    expect(now.total).toBe(21);
    expect(now.inService + now.outOfService + now.unknown).toBe(now.total);
  });
});
