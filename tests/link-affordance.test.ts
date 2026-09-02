import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ReliabilityTable } from "../src/components/ReliabilityTable";
import type { StationReliability } from "../src/lib/metrics/queries";

const CSS = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");

function blockFor(selector: string): string {
  const pattern = new RegExp(`(^|\\})\\s*${selector.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}\\s*\\{`, "m");
  const match = CSS.match(pattern);
  if (!match) throw new Error(`no rule for ${selector}`);

  const open = CSS.indexOf("{", match.index! + match[0].length - 1);
  const close = CSS.indexOf("}", open);
  return CSS.slice(open + 1, close);
}

function station(): StationReliability {
  return {
    slug: "una-estacion",
    name: "Una Estación",
    department: "Montevideo",
    city: "Montevideo",
    latitude: -34.9,
    longitude: -56.2,
    connectorSeconds: 86400,
    unknownSeconds: 0,
    outOfServiceSeconds: 3600,
    availability: 0.8,
    currentlyOutOfService: 1,
  };
}

describe("a link is marked as a link without relying on colour", () => {
  it("underlines every link by default rather than leaving colour to carry it", () => {
    const rule = blockFor("a");

    expect(rule).toMatch(/text-decoration-line:\s*underline/);
    expect(rule, "colour alone would fail WCAG 1.4.1").not.toMatch(/text-decoration-line:\s*none/);
  });

  it("paints links with the accent the palette already proves readable", () => {
    expect(blockFor("a")).toMatch(/color:\s*var\(--accent\)/);
  });

  it("carries the accent past the map, where Leaflet hardcodes a blue of its own", () => {
    expect(blockFor(".leaflet-container .leaflet-popup-content a")).toMatch(
      /color:\s*var\(--accent\)/,
    );
  });

  it("leaves the station names in the reliability table looking clickable", () => {
    const markup = renderToStaticMarkup(
      createElement(ReliabilityTable, { stations: [station()] }),
    );
    const anchor = markup.split("<a ")[1]?.split(">")[0] ?? "";

    expect(anchor, "no anchor rendered").toContain("/estaciones/una-estacion");
    expect(anchor, "the underline is removed, leaving nothing to mark the link").not.toMatch(
      /text-decoration:\s*none/,
    );
  });

  it("keeps the one link that opts out saying so by name", () => {
    const optOut = [...CSS.matchAll(/text-decoration-line:\s*none/g)];

    expect(optOut).toHaveLength(1);
    expect(blockFor(".link-unadorned")).toMatch(/text-decoration-line:\s*none/);
  });
});
