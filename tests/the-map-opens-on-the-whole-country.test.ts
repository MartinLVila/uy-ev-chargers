import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { keepFittingUntilTheReaderMoves, type FittableMap } from "../src/lib/ui/map-fit";
import {
  MAP_FRAME_ASPECT,
  MAP_FRAME_MAX_HEIGHT,
  URUGUAY_BOUNDS,
  type MapBounds,
} from "../src/lib/ui/map-view";
import { MARKER_PRESENTATION } from "../src/lib/ui/health";
import snapshot from "../data/stations.json";

const TILE_SIZE = 256;
const DESKTOP_WIDTH = 1020;
const DESKTOP_ZOOM = 7;

const WIDEST_MARKER = Math.max(
  ...Object.values(MARKER_PRESENTATION).map((marker) => marker.radius),
);

function source(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const MAP_SOURCE = source("src/components/StationMap.tsx");
const PANEL_SOURCE = source("src/components/StationMapPanel.tsx");

const [[south, west], [north, east]] = URUGUAY_BOUNDS;

function mercatorY(latitude: number): number {
  return Math.log(Math.tan(Math.PI / 4 + (latitude * Math.PI) / 360));
}

function spanAtZoom(zoom: number): { width: number; height: number } {
  const world = TILE_SIZE * 2 ** zoom;

  return {
    width: ((east - west) / 360) * world,
    height: ((mercatorY(north) - mercatorY(south)) / (2 * Math.PI)) * world,
  };
}

function marginsAtZoom(
  station: { latitude: number; longitude: number },
  zoom: number,
): number[] {
  const world = TILE_SIZE * 2 ** zoom;

  return [
    ((mercatorY(station.latitude) - mercatorY(south)) / (2 * Math.PI)) * world,
    ((mercatorY(north) - mercatorY(station.latitude)) / (2 * Math.PI)) * world,
    ((station.longitude - west) / 360) * world,
    ((east - station.longitude) / 360) * world,
  ];
}

function fittedZoom(width: number): number {
  const height = Math.min(width / MAP_FRAME_ASPECT, MAP_FRAME_MAX_HEIGHT);
  const country = spanAtZoom(0);

  return Math.log2(Math.min(width / country.width, height / country.height));
}

function frameStyle(code: string): string {
  const open = code.indexOf("borderRadius: 10");
  return code.slice(code.lastIndexOf("style={{", open), open);
}

class AMapThatCanBeMoved implements FittableMap {
  readonly fitted: { bounds: MapBounds; animate: boolean }[] = [];
  private readonly listeners = new Map<string, Set<() => void>>();

  get fits(): number {
    return this.fitted.length;
  }

  on(event: string, listener: () => void): void {
    const forEvent = this.listeners.get(event) ?? new Set();
    forEvent.add(listener);
    this.listeners.set(event, forEvent);
  }

  off(event: string, listener: () => void): void {
    this.listeners.get(event)?.delete(listener);
  }

  fitBounds(bounds: MapBounds, options: { animate: boolean }): void {
    this.fitted.push({ bounds, animate: options.animate });
    this.fire("zoomend");
  }

  resized(): void {
    this.fire("resize");
  }

  readerZoomed(): void {
    this.fire("zoomend");
  }

  readerDragged(): void {
    this.fire("dragend");
  }

  private fire(event: string): void {
    for (const listener of [...(this.listeners.get(event) ?? [])]) listener();
  }
}

describe("the view the map opens on holds the whole country", () => {
  it("keeps every station in the committed snapshot clear of the edge, marker and all", () => {
    const crowded = snapshot
      .map((station) => ({
        slug: station.slug,
        margin: Math.min(...marginsAtZoom(station, DESKTOP_ZOOM)),
      }))
      .filter((station) => station.margin < WIDEST_MARKER)
      .map((station) => `${station.slug} (${station.margin.toFixed(1)}px)`);

    expect(crowded).toEqual([]);
  });

  it("shapes the frame from the country rather than from a number someone liked", () => {
    const country = spanAtZoom(0);

    expect(MAP_FRAME_ASPECT).toBeCloseTo(country.width / country.height, 3);
  });

  it("draws the country large on a desktop instead of shrinking it to fit a tall frame", () => {
    expect(fittedZoom(DESKTOP_WIDTH)).toBeGreaterThanOrEqual(DESKTOP_ZOOM);
  });

  it("caps the frame where the country stops being able to fill its height", () => {
    expect(MAP_FRAME_MAX_HEIGHT).toBeLessThan(spanAtZoom(DESKTOP_ZOOM + 1).height);
  });

  it("fits the bounds it was given, with nothing inset that the frame does not account for", () => {
    const opening = MAP_SOURCE.slice(
      MAP_SOURCE.indexOf("<MapContainer"),
      MAP_SOURCE.indexOf("<TileLayer"),
    );

    expect(opening).toContain("bounds={URUGUAY_BOUNDS}");
    expect(opening).not.toMatch(/\bcenter=\{/);
    expect(opening).not.toMatch(/\bzoom=\{/);
    expect(opening, "padding shrinks the country inside a frame shaped without it").not.toContain(
      "boundsOptions",
    );
  });

  it("lets Leaflet land between whole zoom levels, or the country cannot fill the frame", () => {
    expect(MAP_SOURCE).toContain("zoomSnap={0}");
  });

  it("shapes the frame and its placeholder from the same two numbers", () => {
    for (const [name, code] of [
      ["StationMap", MAP_SOURCE],
      ["StationMapPanel", PANEL_SOURCE],
    ] as const) {
      const style = frameStyle(code);

      expect(style, `${name} does not shape the frame from the shared aspect`).toContain(
        "aspectRatio: MAP_FRAME_ASPECT",
      );
      expect(style, `${name} restates the frame height`).toContain(
        "maxHeight: MAP_FRAME_MAX_HEIGHT",
      );
      expect(style, `${name} restates the frame height`).not.toMatch(/height:\s*\d/);
    }
  });
});

describe("a frame that changes size is refitted, until the reader takes over", () => {
  let map: AMapThatCanBeMoved;
  let stopFitting: () => void;

  beforeEach(() => {
    map = new AMapThatCanBeMoved();
    stopFitting = keepFittingUntilTheReaderMoves(map, URUGUAY_BOUNDS);
  });

  it("fits the country again when the frame changes size", () => {
    map.resized();

    expect(map.fitted).toEqual([{ bounds: URUGUAY_BOUNDS, animate: false }]);
  });

  it("does not mistake its own fit for the reader moving the map", () => {
    map.resized();
    map.resized();

    expect(map.fits).toBe(2);
  });

  it("leaves the view alone once the reader has zoomed in", () => {
    map.readerZoomed();
    map.resized();

    expect(map.fits).toBe(0);
  });

  it("leaves the view alone once the reader has panned", () => {
    map.readerDragged();
    map.resized();

    expect(map.fits).toBe(0);
  });

  it("stops listening when the map goes away", () => {
    stopFitting();
    map.resized();

    expect(map.fits).toBe(0);
  });
});
