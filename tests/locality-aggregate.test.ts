import { describe, expect, it } from "vitest";
import { aggregateByLocality } from "../src/lib/ui/locality";
import { URUGUAY_BOUNDS } from "../src/lib/ui/map-view";
import type { StationStatus } from "../src/lib/metrics/queries";
import fixtureStations from "../data/stations.json";

const [[south, west], [north, east]] = URUGUAY_BOUNDS;

function station(overrides: Partial<StationStatus>): StationStatus {
  return {
    slug: "una-estacion",
    name: "Una Estación",
    address: null,
    city: "Montevideo",
    department: "Montevideo",
    latitude: -34.9,
    longitude: -56.2,
    presence: "listed",
    connectors: 2,
    operational: 2,
    faulted: 0,
    unknown: 0,
    absent: 0,
    outOfService: 0,
    lastSeenAt: "2026-09-07T00:00:00.000Z",
    ...overrides,
  };
}

const stations = fixtureStations as StationStatus[];

describe("the locality count is asserted against the committed snapshot", () => {
  it("derives exactly this many localities from the current fixture", () => {
    expect(aggregateByLocality(stations)).toHaveLength(100);
  });
});

describe("the totals reconcile against the fixture, computed independently", () => {
  it("sums locality connectors to the network total", () => {
    const networkTotal = stations.reduce((sum, s) => sum + s.connectors, 0);
    const groupedTotal = aggregateByLocality(stations).reduce((sum, g) => sum + g.connectors, 0);

    expect(groupedTotal).toBe(networkTotal);
  });

  it("sums locality out-of-service to the network total", () => {
    const networkTotal = stations.reduce((sum, s) => sum + s.outOfService, 0);
    const groupedTotal = aggregateByLocality(stations).reduce((sum, g) => sum + g.outOfService, 0);

    expect(groupedTotal).toBe(networkTotal);
  });

  it("accounts for every station exactly once", () => {
    const groupedStations = aggregateByLocality(stations).reduce((sum, g) => sum + g.stations, 0);

    expect(groupedStations).toBe(stations.length);
  });
});

describe("every locality's centroid lands inside the country", () => {
  it("never centres a group outside the map's own bounds", () => {
    for (const group of aggregateByLocality(stations)) {
      expect(
        group.latitude,
        `${group.name}'s centroid latitude is outside Uruguay`,
      ).toBeGreaterThanOrEqual(south);
      expect(group.latitude).toBeLessThanOrEqual(north);
      expect(
        group.longitude,
        `${group.name}'s centroid longitude is outside Uruguay`,
      ).toBeGreaterThanOrEqual(west);
      expect(group.longitude).toBeLessThanOrEqual(east);
    }
  });
});

describe("city spellings that name the same place are grouped, ones that do not are kept apart", () => {
  it("merges Rio Branco and Río Branco into one locality", () => {
    const rioBranco = aggregateByLocality(stations).find((g) => g.name.includes("Branco"));

    expect(rioBranco?.stations).toBe(2);
  });

  it("merges Treinta y Tres and Treinta y tres into one locality", () => {
    const treintaYTres = aggregateByLocality(stations).filter((g) =>
      g.name.toLowerCase().startsWith("treinta y tres"),
    );

    expect(treintaYTres).toHaveLength(1);
  });

  it("keeps the two different La Palomas apart, since they are in different departments", () => {
    const laPalomas = aggregateByLocality(stations).filter((g) => g.name === "La Paloma");

    expect(laPalomas).toHaveLength(2);
    expect(laPalomas.map((g) => g.department).sort()).toEqual(["Durazno", "Rocha"]);
  });

  it("strips a department name UTE appended to the city, rather than treating it as its own place", () => {
    const montevideo = aggregateByLocality(stations).find((g) => g.name === "Montevideo");

    expect(montevideo?.stations).toBeGreaterThanOrEqual(60);
  });
});

describe("a station with no city still gets counted", () => {
  it("groups cityless stations together rather than dropping them", () => {
    const withUnnamed = [
      station({ slug: "a", city: "Montevideo" }),
      station({ slug: "b", city: null }),
      station({ slug: "c", city: "" }),
    ];

    const groups = aggregateByLocality(withUnnamed);
    const total = groups.reduce((sum, g) => sum + g.stations, 0);

    expect(total).toBe(3);
    expect(groups.some((g) => g.stations === 2 && g.name !== "Montevideo")).toBe(true);
  });
});

describe("a locality with nothing reported is distinguishable from one that is fully healthy", () => {
  it("carries a connector count of zero through rather than hiding the group", () => {
    const silentTown = [
      station({
        slug: "silent",
        city: "Paraje Silencioso",
        connectors: 0,
        operational: 0,
        outOfService: 0,
      }),
    ];

    const [group] = aggregateByLocality(silentTown);

    expect(group.connectors).toBe(0);
    expect(group.outOfService).toBe(0);
  });
});
