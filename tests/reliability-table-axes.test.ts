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

function occurrences(markup: string, needle: string): number {
  return markup.split(needle).length - 1;
}

function headOf(markup: string): string {
  return markup.slice(markup.indexOf("<thead>"), markup.indexOf("</thead>"));
}

function bodyOf(markup: string): string {
  return markup.slice(markup.indexOf("<tbody>"));
}

describe("the reliability table declares the axes a screen reader navigates by", () => {
  it("scopes every heading in the head to its column", () => {
    const head = headOf(render([station()]));

    expect(occurrences(head, "<th ")).toBeGreaterThan(0);
    expect(occurrences(head, "<th ")).toBe(occurrences(head, 'scope="col"'));
  });

  it("makes the station name the header of its row, and scopes it to the row", () => {
    const body = bodyOf(render([station(), station({ slug: "otra", name: "Otra Estación" })]));

    expect(occurrences(body, "<th ")).toBe(2);
    expect(occurrences(body, "<th ")).toBe(occurrences(body, 'scope="row"'));
  });

  it("says what a row holds, which the heading above the table does not", () => {
    const markup = render([station()]);

    expect(markup).toContain("<caption");
    expect(markup).toContain("Una fila por estación");
    expect(markup, "the heading already says this out loud").not.toContain(
      "Estaciones con peor disponibilidad",
    );
  });

  it("puts the department under the station name rather than in its own column", () => {
    const markup = render([station({ department: "Canelones" })]);

    expect(occurrences(headOf(markup), "<th ")).toBe(2);
    expect(markup).toContain("Canelones");
  });
});
