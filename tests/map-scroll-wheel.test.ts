import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const SOURCE = readFileSync(new URL("../src/components/StationMap.tsx", import.meta.url), "utf8");

function mapContainer(): string {
  return SOURCE.slice(SOURCE.indexOf("<MapContainer"), SOURCE.indexOf("</MapContainer>"));
}

describe("the map does not take the wheel from the page it sits inside", () => {
  it("turns wheel zoom off", () => {
    expect(mapContainer()).toContain("scrollWheelZoom={false}");
  });

  it("never leaves it on by default again", () => {
    expect(SOURCE, "a bare scrollWheelZoom prop is enabled").not.toMatch(
      /scrollWheelZoom\s*$/m,
    );
    expect(SOURCE).not.toContain("scrollWheelZoom={true}");
  });

  it("keeps the zoom control, which is now the only way in", () => {
    expect(mapContainer(), "zoomControl defaults to true and must not be turned off").not.toContain(
      "zoomControl={false}",
    );
  });

  it("says how to zoom, since a map that ignores the wheel looks broken otherwise", () => {
    expect(SOURCE).toContain("usá los botones + y −");
  });
});
