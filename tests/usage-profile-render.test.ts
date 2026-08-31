import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ConnectorUsageProfile } from "../src/components/ConnectorUsageProfile";
import type { ConnectorGroupHourlyUsage } from "../src/lib/metrics/queries";
import { hourRangeLabel } from "../src/lib/ui/hourly-usage";

const UNOBSERVED_HOUR = 3;
const BROKEN_HOUR = 1;
const KNOWN_TRACK = "background:var(--surface-2)";
const CELL_MARKER = '<div style="flex:1 1 0;min-width:0"';

function station(overrides: Partial<ConnectorGroupHourlyUsage> = {}): ConnectorGroupHourlyUsage {
  return {
    connectorGroupId: 1,
    connectorType: "CCS2",
    powerKw: 60,
    hasCable: true,
    connectorCount: 2,
    hours: Array.from({ length: 24 }, (_, hour) => ({
      hour,
      utilization: 0.5,
      brokenShare: hour === BROKEN_HOUR ? 0.4 : 0,
      observedHours: 30,
    })).filter((point) => point.hour !== UNOBSERVED_HOUR),
    ...overrides,
  };
}

function render(groups: ConnectorGroupHourlyUsage[]): string {
  return renderToStaticMarkup(createElement(ConnectorUsageProfile, { groups }));
}

function hourCell(markup: string, hour: number): string {
  const range = hourRangeLabel(hour);
  const cell = markup.split(CELL_MARKER).find((segment) => segment.includes(range));
  if (!cell) throw new Error(`no chart cell for ${range}`);
  return cell;
}

describe("the hourly usage chart", () => {
  it("draws no out-of-service track for an hour it never observed", () => {
    const markup = render([station()]);
    const cell = hourCell(markup, UNOBSERVED_HOUR);

    expect(cell).toContain("Sin datos");
    expect(cell).not.toContain(KNOWN_TRACK);
  });

  it("still draws the out-of-service track for an hour it did observe", () => {
    const markup = render([station()]);

    expect(hourCell(markup, BROKEN_HOUR)).toContain(KNOWN_TRACK);
    expect(hourCell(markup, 12)).toContain(KNOWN_TRACK);
  });

  it("offers the hourly figures without a hover, for keyboard and touch", () => {
    const markup = render([station()]);

    expect(markup).toContain("Ver los valores hora por hora");
    expect(markup).toContain("<table");
    expect(markup).toContain("03:00–04:00");
  });

  it("names a group of unknown size without inventing a connector count", () => {
    const markup = render([station({ connectorCount: null })]);

    expect(markup).toContain("CCS2 de 60 kW con cable");
    expect(markup).not.toContain("0 conectores");
  });

  it("says so plainly when there is nothing to chart", () => {
    expect(render([])).toContain("Todavía no hay observaciones suficientes");
  });
});
