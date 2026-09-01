import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CONNECTOR_HEALTH,
  MARKER_PRESENTATION,
  STATION_PRESENCE,
  USAGE_PRESENTATION,
} from "../src/lib/ui/health";

const OPENSTREETMAP_LAND = "#f2efe9";

const CSS = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");

const TEXT_CONTRAST = 4.5;
const GRAPHIC_CONTRAST = 3;

function tokensInBlock(selector: string): Record<string, string> {
  const start = CSS.indexOf(selector);
  if (start === -1) throw new Error(`no block for ${selector}`);
  const open = CSS.indexOf("{", start);
  const close = CSS.indexOf("}", open);
  const block = CSS.slice(open + 1, close);

  return Object.fromEntries(
    [...block.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6});/g)].map((match) => [match[1], match[2]]),
  );
}

function channel(value: number): number {
  const scaled = value / 255;
  return scaled <= 0.03928 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const value = parseInt(hex.slice(1), 16);
  return (
    0.2126 * channel((value >> 16) & 255) +
    0.7152 * channel((value >> 8) & 255) +
    0.0722 * channel(value & 255)
  );
}

function contrast(foreground: string, background: string): number {
  for (const colour of [foreground, background]) {
    if (!/^#[0-9a-fA-F]{6}$/.test(colour ?? "")) {
      throw new Error(`not a six-digit hex colour: ${String(colour)}`);
    }
  }
  const [lighter, darker] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

const light = tokensInBlock(":root {");
const dark = tokensInBlock(':root[data-theme="dark"] {');
const darkByPreference = tokensInBlock(':root:not([data-theme="light"]) {');

function tokenValue(tokens: Record<string, string>, name: string): string {
  const value = tokens[name];
  if (!value) throw new Error(`--${name} is not declared as a six-digit hex colour`);
  return value;
}

const SURFACES = ["surface-1", "surface-page", "surface-2"];

const CARRIES_TEXT = ["text-secondary", "text-muted", "status-critical", "accent"];
const CARRIES_MEANING = ["status-good", "status-warning", "status-critical", "accent", "chart-neutral"];

describe("the palette meets WCAG contrast on every surface it is painted on", () => {
  for (const [theme, tokens] of [
    ["light", light],
    ["dark", dark],
  ] as const) {
    for (const token of CARRIES_TEXT) {
      for (const surface of SURFACES) {
        it(`${theme}: --${token} is readable as text on --${surface}`, () => {
          expect(
            contrast(tokenValue(tokens, token), tokenValue(tokens, surface)),
          ).toBeGreaterThanOrEqual(TEXT_CONTRAST);
        });
      }
    }

    for (const token of CARRIES_MEANING) {
      for (const surface of SURFACES) {
        it(`${theme}: --${token} is distinguishable as a graphic on --${surface}`, () => {
          expect(
            contrast(tokenValue(tokens, token), tokenValue(tokens, surface)),
          ).toBeGreaterThanOrEqual(GRAPHIC_CONTRAST);
        });
      }
    }
  }

  it("declares the same dark values whether the theme is chosen or inherited from the system", () => {
    for (const [token, value] of Object.entries(dark)) {
      expect(darkByPreference[token], `--${token} drifted between the two dark blocks`).toBe(value);
    }
    expect(Object.keys(darkByPreference).sort()).toEqual(Object.keys(dark).sort());
  });

  it("overrides every status colour in dark rather than inheriting the light one", () => {
    for (const token of Object.keys(light).filter((name) => name.startsWith("status-"))) {
      expect(dark[token], `--${token} is not redefined for dark`).toBeDefined();
    }
  });
});

describe("state is never carried by colour alone", () => {
  it("gives every connector usage state its own symbol", () => {
    const symbols = Object.values(USAGE_PRESENTATION).map((presentation) => presentation.symbol);
    expect(new Set(symbols).size).toBe(symbols.length);
  });

  it("gives every connector usage state its own fill texture, not only its own colour", () => {
    const patterns = Object.values(USAGE_PRESENTATION).map((presentation) => presentation.pattern);
    expect(new Set(patterns).size).toBe(patterns.length);
  });

  for (const [name, states] of [
    ["connector usage", USAGE_PRESENTATION],
    ["connector health", CONNECTOR_HEALTH],
    ["station presence", STATION_PRESENCE],
  ] as const) {
    it(`keeps every ${name} state on a colour no sibling state uses`, () => {
      const colours = Object.values(states).map((presentation) => presentation.color);
      expect(new Set(colours).size, `two ${name} states share a colour`).toBe(colours.length);
    });

    it(`keeps every ${name} state on a symbol no sibling state uses`, () => {
      const symbols = Object.values(states).map((presentation) => presentation.symbol);
      expect(new Set(symbols).size, `two ${name} states share a symbol`).toBe(symbols.length);
    });
  }

  it("gives every map marker state its own symbol, outline and size", () => {
    const presentations = Object.values(MARKER_PRESENTATION);
    const symbols = presentations.map((presentation) => presentation.symbol);
    const shapes = presentations.map(
      (presentation) => `${presentation.dashArray ?? "solid"}@${presentation.radius}`,
    );

    expect(new Set(symbols).size).toBe(symbols.length);
    expect(new Set(shapes).size).toBe(shapes.length);
  });

  it("keeps map markers distinguishable from the tiles they are drawn on", () => {
    for (const [state, presentation] of Object.entries(MARKER_PRESENTATION)) {
      expect(
        contrast(presentation.color, OPENSTREETMAP_LAND),
        `the ${state} marker disappears into the map`,
      ).toBeGreaterThanOrEqual(GRAPHIC_CONTRAST);
    }
  });

  it("paints every marker in the status colour it names, so the two cannot drift", () => {
    for (const [state, presentation] of Object.entries(MARKER_PRESENTATION)) {
      expect(
        presentation.color,
        `the ${state} marker no longer matches --${presentation.statusToken}`,
      ).toBe(tokenValue(light, presentation.statusToken));
    }
  });
});
