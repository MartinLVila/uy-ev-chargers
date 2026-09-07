import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { wheelZoomFollowsFocus, type FocusTarget, type WheelZoom } from "../src/lib/ui/wheel-zoom";

const SOURCE = readFileSync(new URL("../src/components/StationMap.tsx", import.meta.url), "utf8");
const CSS = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");

function mapContainer(): string {
  return SOURCE.slice(SOURCE.indexOf("<MapContainer"), SOURCE.indexOf("</MapContainer>"));
}

class AMapTheReaderCanFocus implements FocusTarget, WheelZoom {
  zooms = false;
  private focusIsInside = false;
  private readonly listeners = new Map<string, Set<(event: KeyboardEvent) => void>>();

  addEventListener(type: string, listener: (event: KeyboardEvent) => void): void {
    const forType = this.listeners.get(type) ?? new Set();
    forType.add(listener);
    this.listeners.set(type, forType);
  }

  removeEventListener(type: string, listener: (event: KeyboardEvent) => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  blur(): void {
    if (this.focusIsInside) this.blurred();
  }

  enable(): void {
    this.zooms = true;
  }

  disable(): void {
    this.zooms = false;
  }

  focused(): void {
    this.focusIsInside = true;
    this.fire("focusin");
  }

  tabbedOntoTheZoomButton(): void {
    this.fire("focusout");
    this.fire("focusin");
  }

  blurred(): void {
    this.focusIsInside = false;
    this.fire("focusout");
  }

  pressed(key: string): void {
    this.fire("keydown", { key } as KeyboardEvent);
  }

  private fire(type: string, event = {} as KeyboardEvent): void {
    for (const listener of [...(this.listeners.get(type) ?? [])]) listener(event);
  }
}

describe("the wheel belongs to the page until the reader aims at the map", () => {
  let map: AMapTheReaderCanFocus;
  let stopFollowing: () => void;

  beforeEach(() => {
    map = new AMapTheReaderCanFocus();
    map.enable();
    stopFollowing = wheelZoomFollowsFocus(map, map);
  });

  it("leaves the wheel with the page on arrival, however the map was configured", () => {
    expect(map.zooms).toBe(false);
  });

  it("gives the wheel to the map once the reader focuses it", () => {
    map.focused();

    expect(map.zooms).toBe(true);
  });

  it("gives the wheel back when the reader leaves the map", () => {
    map.focused();
    map.blurred();

    expect(map.zooms).toBe(false);
  });

  it("keeps the wheel while focus moves to the map's own zoom buttons", () => {
    map.focused();
    map.tabbedOntoTheZoomButton();

    expect(map.zooms).toBe(true);
  });

  it("hands the wheel back on Escape, without making the reader click somewhere else", () => {
    map.focused();
    map.pressed("Escape");

    expect(map.zooms).toBe(false);
  });

  it("keeps the wheel on any other key, so panning with the arrows does not give it up", () => {
    map.focused();
    map.pressed("ArrowLeft");

    expect(map.zooms).toBe(true);
  });

  it("stops listening when the map goes away, so a stale map cannot take the wheel", () => {
    stopFollowing();
    map.focused();

    expect(map.zooms).toBe(false);
  });
});

describe("the map is set up to let the reader ask for the wheel", () => {
  it("still starts with wheel zoom off in the markup", () => {
    expect(mapContainer()).toContain("scrollWheelZoom={false}");
    expect(SOURCE, "a bare scrollWheelZoom prop is enabled").not.toMatch(/scrollWheelZoom\s*$/m);
    expect(SOURCE).not.toContain("scrollWheelZoom={true}");
  });

  it("hands the container and its wheel handler to the focus rule", () => {
    expect(SOURCE).toContain("wheelZoomFollowsFocus(map.getContainer(), map.scrollWheelZoom)");
    expect(mapContainer()).toContain("<WheelZoomFollowsFocus />");
  });

  it("keeps the zoom control, which works whether or not the map has focus", () => {
    expect(mapContainer(), "zoomControl defaults to true and must not be turned off").not.toContain(
      "zoomControl={false}",
    );
  });

  it("rings the map for as long as it holds the wheel, not only while the container has focus", () => {
    expect(CSS).toMatch(/\.leaflet-container[^{]*:focus-within\s*\{[^}]*outline:/);
    expect(CSS, "a plain :focus ring goes out while a child still holds the wheel").not.toMatch(
      /\.leaflet-container[^{]*:focus\s*\{/,
    );
  });

  it("says how to take the wheel and how to give it back", () => {
    expect(SOURCE).toContain("la rueda");
    expect(SOURCE).toContain("Escape");
    expect(SOURCE).toContain("Los botones + y −");
  });
});
