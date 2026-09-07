import { describe, expect, it } from "vitest";
import { groupByDepartment, matchesStationQuery, pipCounts } from "../src/lib/ui/station-list";
import type { StationStatus } from "../src/lib/metrics/queries";

function station(overrides: Partial<StationStatus> = {}): StationStatus {
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
    lastSeenAt: "2026-09-04T19:00:00.000Z",
    ...overrides,
  };
}

describe("a nonzero fault count is never rounded away to zero red pips", () => {
  it("gives one faulted connector out of twenty its own pip, not a rounding error", () => {
    const counts = pipCounts(station({ operational: 19, faulted: 1, unknown: 0, absent: 0 }));

    expect(counts.bad).toBe(1);
    expect(counts.total).toBe(20);
  });

  it("draws every connector exactly once, since nothing is compressed to a fixed width", () => {
    const counts = pipCounts(station({ operational: 12, faulted: 8, unknown: 0, absent: 0 }));

    expect(counts.good + counts.warn + counts.bad).toBe(20);
  });

  it("means exactly zero red pips when a station is genuinely all healthy", () => {
    const counts = pipCounts(station({ operational: 5, faulted: 0, unknown: 0, absent: 0 }));

    expect(counts.bad).toBe(0);
  });

  it("gives a connector with no telemetry its own colour rather than counting it as healthy", () => {
    const counts = pipCounts(station({ operational: 3, faulted: 0, unknown: 0, absent: 2 }));

    expect(counts.warn).toBe(2);
    expect(counts.good).toBe(3);
  });
});

describe("the search matches on name and locality together", () => {
  it("matches by station name", () => {
    expect(matchesStationQuery(station({ name: "Terminal Piriápolis" }), "piria")).toBe(true);
  });

  it("matches by city even when the name does not contain it", () => {
    expect(matchesStationQuery(station({ name: "Ancap ruta 5", city: "Florida" }), "florida")).toBe(
      true,
    );
  });

  it("ignores accents, since a search box should not require the reader's keyboard to have them", () => {
    expect(matchesStationQuery(station({ city: "Atlántida" }), "atlantida")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(matchesStationQuery(station({ name: "ANCAP Rivera" }), "ancap rivera")).toBe(true);
  });

  it("matches everything on an empty query", () => {
    expect(matchesStationQuery(station(), "")).toBe(true);
    expect(matchesStationQuery(station(), "   ")).toBe(true);
  });

  it("does not match unrelated text", () => {
    expect(matchesStationQuery(station({ name: "Ancap Rivera", city: "Rivera" }), "salto")).toBe(
      false,
    );
  });

  it("copes with a station that has no city at all", () => {
    expect(matchesStationQuery(station({ city: null }), "ancap")).toBe(false);
    expect(() => matchesStationQuery(station({ city: null }), "")).not.toThrow();
  });
});

describe("departments group and order both levels, and keep an honest denominator", () => {
  it("orders departments and the stations within them", () => {
    const groups = groupByDepartment(
      [
        station({ slug: "b-mvd", name: "Zeta", department: "Montevideo" }),
        station({ slug: "a-mvd", name: "Alfa", department: "Montevideo" }),
        station({ slug: "a-art", name: "Uno", department: "Artigas" }),
      ],
      [
        station({ slug: "b-mvd", name: "Zeta", department: "Montevideo" }),
        station({ slug: "a-mvd", name: "Alfa", department: "Montevideo" }),
        station({ slug: "a-art", name: "Uno", department: "Artigas" }),
      ],
    );

    expect(groups.map((g) => g.department)).toEqual(["Artigas", "Montevideo"]);
    expect(groups[1].stations.map((s) => s.slug)).toEqual(["a-mvd", "b-mvd"]);
  });

  it("carries the unfiltered department total separately from the filtered count", () => {
    const all = [
      station({ slug: "a", department: "Salto" }),
      station({ slug: "b", department: "Salto" }),
      station({ slug: "c", department: "Salto" }),
    ];
    const filtered = all.filter((s) => s.slug !== "c");

    const [group] = groupByDepartment(filtered, all);

    expect(group.stations).toHaveLength(2);
    expect(group.totalInDepartment).toBe(3);
  });

  it("drops a department entirely once nothing in it matches", () => {
    const all = [
      station({ slug: "a", department: "Salto" }),
      station({ slug: "b", department: "Rocha" }),
    ];
    const filtered = all.filter((s) => s.department === "Rocha");

    const groups = groupByDepartment(filtered, all);

    expect(groups.map((g) => g.department)).toEqual(["Rocha"]);
  });
});
