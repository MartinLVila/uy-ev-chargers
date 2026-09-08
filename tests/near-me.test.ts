import { describe, expect, it } from "vitest";
import { availabilityClaim } from "../src/lib/ui/near-me";
import { connectorsNowByUsage } from "../src/lib/ui/health";
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

describe("the availability claim never outruns what the feed actually reported", () => {
  const freeTally = connectorsNowByUsage([entry({ statusDetail: "available", connectorCount: 1 })]);
  const fullTally = connectorsNowByUsage([
    entry({ health: "faulted", statusDetail: "unavailable", connectorCount: 1 }),
  ]);

  it("says there is room when a connector is actually free and the feed is current", () => {
    expect(availabilityClaim("listed", freeTally)).toBe("Ahora hay lugar.");
  });

  it("says there is no free room when every connector is occupied or broken", () => {
    expect(availabilityClaim("listed", fullTally)).toBe("Ahora no hay lugar libre.");
  });

  it("refuses to claim room at all once the station has gone silent", () => {
    expect(availabilityClaim("silent", freeTally)).toContain("No sabemos si hay lugar ahora");
  });

  it("refuses to claim room once the station has dropped out of the feed", () => {
    expect(availabilityClaim("delisted", freeTally)).toContain("No sabemos si hay lugar ahora");
  });

  it("refuses to claim room when nothing at all has a reported state", () => {
    const emptyTally = connectorsNowByUsage([]);

    expect(availabilityClaim("listed", emptyTally)).toContain("No sabemos si hay lugar ahora");
  });
});
