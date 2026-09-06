import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ConnectorUsageProfile } from "../src/components/ConnectorUsageProfile";
import { USAGE_PRESENTATION, type ConnectorUsage } from "../src/lib/ui/health";
import type { ConnectorGroupHourlyUsage } from "../src/lib/metrics/queries";

const STATES = Object.keys(USAGE_PRESENTATION) as ConnectorUsage[];

function source(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const CSS = source("src/app/globals.css");
const CALENDAR_SOURCE = source("src/components/ConnectorHistory.tsx");
const PROFILE_SOURCE = source("src/components/ConnectorUsageProfile.tsx");

function themeTokens(selector: string): Record<string, string> {
  const start = CSS.indexOf(selector);
  if (start === -1) throw new Error(`no block for ${selector}`);
  const open = CSS.indexOf("{", start);
  const close = CSS.indexOf("}", open);

  return Object.fromEntries(
    [...CSS.slice(open + 1, close).matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6});/g)].map((match) => [
      match[1],
      match[2].toLowerCase(),
    ]),
  );
}

const THEMES = {
  claro: themeTokens(":root {"),
  oscuro: themeTokens(':root[data-theme="dark"] {'),
};

function resolveColour(colour: string, tokens: Record<string, string>): string {
  const named = colour.match(/^var\(--([\w-]+)\)$/);
  if (!named) return colour.toLowerCase();

  const value = tokens[named[1]];
  if (!value) throw new Error(`--${named[1]} is not declared as a six-digit hex colour`);
  return value;
}

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

describe("a connector state is drawn from one place and named the same way everywhere", () => {
  it("gives every state both a mark colour and a calendar fill", () => {
    for (const state of STATES) {
      expect(USAGE_PRESENTATION[state].color, state).toMatch(/^var\(--/);
      expect(USAGE_PRESENTATION[state].dayFill, state).toMatch(/^var\(--/);
    }
  });

  it("draws every state but «con falla» in a recessive calendar tone of its own", () => {
    const recessive = STATES.filter(
      (state) => USAGE_PRESENTATION[state].dayFill !== USAGE_PRESENTATION[state].color,
    );

    expect(recessive).toEqual(["free", "inUse", "absent", "unknown"]);
  });

  it("gives a broken day the full-strength critical tone, not a muted one", () => {
    expect(USAGE_PRESENTATION.broken.dayFill).toBe(USAGE_PRESENTATION.broken.color);
    expect(USAGE_PRESENTATION.broken.dayFill).toBe("var(--status-critical)");
  });

  for (const [theme, tokens] of Object.entries(THEMES)) {
    it(`paints no two states the same colour in tema ${theme}`, () => {
      const painted = STATES.map((state) => resolveColour(USAGE_PRESENTATION[state].dayFill, tokens));

      expect(new Set(painted).size, painted.join(" ")).toBe(STATES.length);
    });
  }

  it("leaves no component restating a day colour of its own", () => {
    expect(CALENDAR_SOURCE).not.toMatch(/var\(--day-/);
    expect(PROFILE_SOURCE).not.toMatch(/var\(--day-/);
  });

  it("says «con falla», never «fuera de servicio», anywhere in the hourly profile", () => {
    const markup = profileMarkup();

    expect(markup).toContain(USAGE_PRESENTATION.broken.label);
    expect(markup).not.toMatch(/fuera de servicio/i);
  });

  it("takes every state name in the hourly profile from the shared source", () => {
    const restated = [...PROFILE_SOURCE.matchAll(/["'>]\s*(En uso|Con falla|Fuera de servicio)\s*[<"']/gi)];

    expect(restated.map((match) => match[1])).toEqual([]);
  });

  it("still names the hourly measure in the chart the reader sees", () => {
    expect(profileMarkup()).toContain(USAGE_PRESENTATION.inUse.label);
  });
});
