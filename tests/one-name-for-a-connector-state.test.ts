import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ConnectorUsageProfile } from "../src/components/ConnectorUsageProfile";
import { USAGE_PRESENTATION } from "../src/lib/ui/health";
import type { ConnectorGroupHourlyUsage } from "../src/lib/metrics/queries";

const PROFILE_SOURCE = readFileSync(
  new URL("../src/components/ConnectorUsageProfile.tsx", import.meta.url),
  "utf8",
);

const A_GROUP_WITH_A_BROKEN_HOUR: ConnectorGroupHourlyUsage[] = [
  {
    connectorGroupId: 1,
    connectorType: "CCS2",
    powerKw: 60,
    hasCable: true,
    connectorCount: 2,
    hours: Array.from({ length: 24 }, (_, hour) => ({
      hour,
      utilization: 0.4,
      brokenShare: hour === 3 ? 0.5 : 0,
      observedHours: 90,
    })),
  },
];

function profileMarkup(): string {
  return renderToStaticMarkup(
    createElement(ConnectorUsageProfile, { groups: A_GROUP_WITH_A_BROKEN_HOUR }),
  );
}

describe("a connector state is named the same way everywhere it appears", () => {
  it("says «con falla», never «fuera de servicio», anywhere in the hourly profile", () => {
    const markup = profileMarkup();

    expect(markup).toContain(USAGE_PRESENTATION.broken.label);
    expect(markup).not.toMatch(/fuera de servicio/i);
  });

  it("takes every state name in the hourly profile from the shared source", () => {
    const restated = [
      ...PROFILE_SOURCE.matchAll(/["'>]\s*(En uso|Con falla|Fuera de servicio)\s*[<"']/gi),
    ];

    expect(restated.map((match) => match[1])).toEqual([]);
  });

  it("still names the hourly measure in the chart the reader sees", () => {
    expect(profileMarkup()).toContain(USAGE_PRESENTATION.inUse.label);
  });
});
