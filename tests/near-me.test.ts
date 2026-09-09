import { describe, expect, it } from "vitest";
import {
  availabilityClaim,
  localityHref,
  rankNearestLocalities,
  type LocalityPosition,
} from "../src/lib/ui/near-me";
import { UNNAMED_LOCALITY } from "../src/lib/ui/locality";
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

const MONTEVIDEO = { latitude: -34.9011, longitude: -56.1645 };

function place(
  name: string,
  department: string,
  latitude: number,
  longitude: number,
): LocalityPosition {
  return { name, department, latitude, longitude };
}

const CENTRO = place("Centro", "Montevideo", -34.9011, -56.1645);
const PUNTA_DEL_ESTE = place("Punta del Este", "Maldonado", -34.9581, -54.9337);
const RIVERA = place("Rivera", "Rivera", -30.9053, -55.5508);

function fixAt(accuracyMetres: number) {
  return { ...MONTEVIDEO, accuracyMetres };
}

describe("a locality link carries the department, so a shared name never resolves to the wrong place", () => {
  it("names both the locality and its department", () => {
    expect(localityHref({ name: "La Paloma", department: "Rocha" })).toBe(
      "/cerca?localidad=La+Paloma&departamento=Rocha",
    );
  });

  it("keeps extra parameters alongside them", () => {
    expect(
      localityHref({ name: "La Paloma", department: "Rocha" }, { estacion: "la-paloma-rocha" }),
    ).toBe("/cerca?localidad=La+Paloma&departamento=Rocha&estacion=la-paloma-rocha");
  });
});

describe("the nearest localities are ranked only when the position fix can support the claim", () => {
  it("orders them by distance and keeps the nearest first", () => {
    const nearest = rankNearestLocalities(fixAt(20), [RIVERA, PUNTA_DEL_ESTE, CENTRO]);

    expect(nearest.outcome).toBe("ranked");
    if (nearest.outcome !== "ranked") return;
    expect(nearest.localities.map((locality) => locality.name)).toEqual([
      "Centro",
      "Punta del Este",
      "Rivera",
    ]);
    expect(nearest.localities[0].distanceKm).toBeCloseTo(0, 5);
  });

  it("says nothing about a margin when the fix is precise", () => {
    const nearest = rankNearestLocalities(fixAt(20), [CENTRO]);

    expect(nearest.outcome === "ranked" && nearest.marginKm).toBeNull();
  });

  it("names the margin once it is wide enough to change the order", () => {
    const nearest = rankNearestLocalities(fixAt(8_000), [CENTRO]);

    expect(nearest.outcome === "ranked" && nearest.marginKm).toBe(8);
  });

  it("refuses to rank at all on a fix too coarse to mean anything", () => {
    const nearest = rankNearestLocalities(fixAt(90_000), [CENTRO, PUNTA_DEL_ESTE]);

    expect(nearest).toEqual({ outcome: "fix-too-coarse", marginKm: 90 });
  });

  it("says the reader is outside the network rather than pointing at a place hundreds of km away", () => {
    const madrid = { latitude: 40.4168, longitude: -3.7038, accuracyMetres: 20 };

    const nearest = rankNearestLocalities(madrid, [CENTRO, PUNTA_DEL_ESTE]);

    expect(nearest.outcome).toBe("outside-the-network");
    if (nearest.outcome !== "outside-the-network") return;
    expect(nearest.nearestKm).toBeGreaterThan(9_000);
  });

  it("says so too when there is no locality to rank", () => {
    expect(rankNearestLocalities(fixAt(20), []).outcome).toBe("outside-the-network");
  });

  it("never ranks the bucket of stations whose locality is unknown", () => {
    const unnamed = place(UNNAMED_LOCALITY, "Montevideo", -34.9011, -56.1645);

    const nearest = rankNearestLocalities(fixAt(20), [unnamed, PUNTA_DEL_ESTE]);

    expect(nearest.outcome).toBe("ranked");
    if (nearest.outcome !== "ranked") return;
    expect(nearest.localities.map((locality) => locality.name)).toEqual(["Punta del Este"]);
  });

  it("shows at most five, however many localities there are", () => {
    const many = Array.from({ length: 12 }, (_, index) =>
      place(`Localidad ${index}`, "Canelones", -34.9 - index / 100, -56.16),
    );

    const nearest = rankNearestLocalities(fixAt(20), many);

    expect(nearest.outcome === "ranked" && nearest.localities.length).toBe(5);
  });
});
