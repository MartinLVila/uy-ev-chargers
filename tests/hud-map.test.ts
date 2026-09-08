import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildCountryPaths,
  buildLocalityPoints,
  localityRadius,
  localityState,
  localityTooltip,
  VIEW_HEIGHT,
  VIEW_WIDTH,
} from "../src/lib/ui/hud-map";
import { aggregateByLocality, type LocalityAggregate } from "../src/lib/ui/locality";
import type { StationStatus } from "../src/lib/metrics/queries";
import type { Topology } from "topojson-specification";
import geometry from "../public/map/uy-region.json";
import fixtureStations from "../data/stations.json";

const stations = fixtureStations as StationStatus[];
const topology = geometry as unknown as Topology;

describe("a locality's radius grows with its connector count, never shrinks with it", () => {
  it("gives a locality with nothing a small but visible dot", () => {
    expect(localityRadius(0)).toBeCloseTo(3.2, 5);
  });

  it("grows monotonically as connectors grow", () => {
    const radii = [0, 1, 5, 20, 100].map(localityRadius);
    for (let i = 1; i < radii.length; i += 1) {
      expect(radii[i]).toBeGreaterThan(radii[i - 1]);
    }
  });
});

describe("a locality with nothing observed is never drawn as healthy", () => {
  it("is 'unknown', not 'good', when connectors is zero", () => {
    expect(localityState({ observed: false, outOfService: 0 })).toBe("unknown");
  });

  it("is 'good' only when observed and nothing is out of service", () => {
    expect(localityState({ observed: true, outOfService: 0 })).toBe("good");
  });

  it("is 'bad' whenever anything is out of service, however small", () => {
    expect(localityState({ observed: true, outOfService: 1 })).toBe("bad");
  });

  it("says so in words, not just in colour", () => {
    expect(localityTooltip({ name: "Ejemplo", fleet: 0, outOfService: 0, observed: false })).toBe(
      "Ejemplo: sin datos recientes.",
    );
    expect(localityTooltip({ name: "Ejemplo", fleet: 5, outOfService: 0, observed: true })).toBe(
      "Ejemplo: 5 conectores, todos en servicio.",
    );
    expect(localityTooltip({ name: "Ejemplo", fleet: 5, outOfService: 2, observed: true })).toBe(
      "Ejemplo: 5 conectores, 2 fuera de servicio.",
    );
  });
});

function locality(overrides: Partial<LocalityAggregate>): LocalityAggregate {
  return {
    name: "Ejemplo",
    department: "Montevideo",
    latitude: -34.9,
    longitude: -56.2,
    stations: 1,
    connectors: 0,
    absent: 0,
    outOfService: 0,
    ...overrides,
  };
}

describe("a locality known only to be absent is still observed, not a blank", () => {
  it("counts absent connectors into the fleet a circle is sized and coloured from", () => {
    const { projection } = buildCountryPaths(topology);
    const [point] = buildLocalityPoints(
      [locality({ connectors: 0, absent: 4, outOfService: 4 })],
      projection,
    );

    expect(point.observed).toBe(true);
    expect(point.fleet).toBe(4);
    expect(localityState(point)).toBe("bad");
  });

  it("stays unknown only when the locality has neither reported nor absent connectors", () => {
    const { projection } = buildCountryPaths(topology);
    const [point] = buildLocalityPoints(
      [locality({ connectors: 0, absent: 0, outOfService: 0 })],
      projection,
    );

    expect(point.observed).toBe(false);
    expect(localityState(point)).toBe("unknown");
  });
});

describe("out of service never outgrows the fleet it is drawn against", () => {
  it("keeps outOfService within fleet even when absent connectors dominate a locality", () => {
    const { projection } = buildCountryPaths(topology);
    const [point] = buildLocalityPoints(
      [locality({ connectors: 1, absent: 5, outOfService: 5 })],
      projection,
    );

    expect(point.outOfService).toBeLessThanOrEqual(point.fleet);
  });
});

describe("a locality whose coordinates project off the map is dropped, not drawn at NaN", () => {
  it("skips a locality with an out-of-range latitude instead of emitting NaN geometry", () => {
    const { projection } = buildCountryPaths(topology);
    const points = buildLocalityPoints([locality({ latitude: 500, longitude: -56.2 })], projection);

    expect(points).toEqual([]);
  });
});

describe("the projection fits the whole country inside the frame", () => {
  it("keeps every point of Uruguay's own outline within the inset box", () => {
    const { paths } = buildCountryPaths(topology);
    const uruguay = paths.find((p) => p.isUruguay);
    expect(uruguay?.d, "Uruguay's path is empty").toBeTruthy();

    const coordinates = [...(uruguay?.d ?? "").matchAll(/(-?\d+\.?\d*),(-?\d+\.?\d*)/g)].map(
      (match) => [Number(match[1]), Number(match[2])] as const,
    );
    expect(coordinates.length).toBeGreaterThan(10);

    const minX = Math.min(...coordinates.map(([x]) => x));
    const maxX = Math.max(...coordinates.map(([x]) => x));
    const minY = Math.min(...coordinates.map(([, y]) => y));
    const maxY = Math.max(...coordinates.map(([, y]) => y));

    expect(minX).toBeGreaterThanOrEqual(VIEW_WIDTH * 0.08 - 1);
    expect(maxX).toBeLessThanOrEqual(VIEW_WIDTH * 0.92 + 1);
    expect(minY).toBeGreaterThanOrEqual(VIEW_HEIGHT * 0.06 - 1);
    expect(maxY).toBeLessThanOrEqual(VIEW_HEIGHT * 0.94 + 1);
  });

  it("keeps every real locality's circle, marker and all, inside the drawn frame", () => {
    const localities = aggregateByLocality(stations);
    const { projection } = buildCountryPaths(topology);
    const points = buildLocalityPoints(localities, projection);

    expect(points.length).toBeGreaterThan(50);

    const crowded = points
      .filter(
        (point) =>
          point.x - point.radius < 0 ||
          point.x + point.radius > VIEW_WIDTH ||
          point.y - point.radius < 0 ||
          point.y + point.radius > VIEW_HEIGHT,
      )
      .map((point) => point.name);

    expect(crowded).toEqual([]);
  });
});

describe("the static map does not capture the reader's wheel", () => {
  const SOURCE = readFileSync(new URL("../src/components/HudMapView.tsx", import.meta.url), "utf8");

  it("attaches no wheel handling at all, since there is nothing to zoom", () => {
    expect(SOURCE).not.toMatch(/onWheel|wheel/i);
  });

  it("attaches no touchstart-only handling, so touch and keyboard get the same tooltip", () => {
    expect(SOURCE).not.toContain("touchstart");
    expect(SOURCE).toContain("onClick");
    expect(SOURCE).toContain("onFocus");
  });
});

describe("every circle is reachable and its state is readable without a pointer", () => {
  const SOURCE = readFileSync(new URL("../src/components/HudMapView.tsx", import.meta.url), "utf8");

  it("puts every locality in the tab order with its own accessible name", () => {
    expect(SOURCE).toContain("tabIndex={0}");
    expect(SOURCE).toContain("aria-label={localityTooltip(point)}");
  });

  it("keeps a text alternative for the whole map, not just a per-circle label", () => {
    expect(SOURCE).toContain("visually-hidden");
    expect(SOURCE).toContain("<details");
  });
});

describe("the drawn corridors are not shipped", () => {
  it("names no route, since a hand-drawn line is a claim this app cannot back with data", () => {
    const SOURCE = readFileSync(new URL("../src/components/HudMapView.tsx", import.meta.url), "utf8");
    expect(SOURCE.toLowerCase()).not.toMatch(/corridor|corredor|ruta 1\b|ruta 5\b|ruta 9\b/);
  });
});
