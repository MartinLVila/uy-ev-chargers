import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ReliabilityTable } from "../src/components/ReliabilityTable";
import type { StationReliability } from "../src/lib/metrics/queries";

function station(overrides: Partial<StationReliability> = {}): StationReliability {
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
    availability: 0.783,
    currentlyOutOfService: 3,
    ...overrides,
  };
}

function render(stations: StationReliability[]): string {
  return renderToStaticMarkup(createElement(ReliabilityTable, { stations }));
}

describe("a station with no observation in the window is never drawn as 0%", () => {
  it("says it is unclassified rather than printing a percentage", () => {
    const markup = render([station({ availability: null })]);

    expect(markup).toContain("sin clasificar");
    expect(markup).not.toContain("0,0%");
  });

  it("draws no fill in the bar track for an unclassified station", () => {
    const markup = render([station({ availability: null })]);

    expect(markup).not.toContain("reliability-bar-fill");
  });
});

describe("a real zero still shows something in the bar", () => {
  it("floors a 0% station's bar rather than rendering it empty", () => {
    const markup = render([station({ availability: 0 })]);

    expect(markup).toContain("width:1.5%");
  });

  it("never floors a bar below the value it is next to", () => {
    const markup = render([station({ availability: 0.4 })]);

    expect(markup).toContain("width:40%");
  });
});

describe("the bar colour crosses into worse thresholds together with the label", () => {
  it("is critical below 25%", () => {
    const markup = render([station({ availability: 0.24 })]);

    expect(markup).toContain("var(--status-critical)");
  });

  it("is a warning from 25% up to 55%", () => {
    const markup = render([station({ availability: 0.4 })]);

    expect(markup).toContain("var(--status-warning)");
    expect(markup).not.toContain("var(--status-critical)");
  });

  it("is healthy at 55% and above", () => {
    const markup = render([station({ availability: 0.55 })]);

    expect(markup).toContain("var(--status-good)");
    expect(markup).not.toContain("var(--status-critical)");
    expect(markup).not.toContain("var(--status-warning)");
  });
});
