import { readWithUnixLineEndings } from "./helpers/source-text";
import { describe, expect, it } from "vitest";
import {
  CONNECTOR_HEALTH,
  MARKER_PRESENTATION,
  STATION_PRESENCE,
  USAGE_PRESENTATION,
} from "../src/lib/ui/health";
import { contrast, toRgb255, tokenValue, tokensInBlock } from "./helpers/colour";

const OPENSTREETMAP_LAND = "#f2efe9";

const CSS = readWithUnixLineEndings(new URL("../src/app/globals.css", import.meta.url));

const TEXT_CONTRAST = 4.5;
const GRAPHIC_CONTRAST = 3;

const light = tokensInBlock(CSS, ":root {");
const dark = tokensInBlock(CSS, ':root[data-theme="dark"] {');
const darkByPreference = tokensInBlock(CSS, ':root:not([data-theme="light"]) {');

function resolveColour(colour: string, tokens: Record<string, string>): string {
  const named = colour.match(/^var\(--([\w-]+)\)$/);
  return named ? tokenValue(tokens, named[1]).toLowerCase() : colour.toLowerCase();
}

const SURFACES = ["surface-1", "surface-page", "surface-2"];

const CARRIES_TEXT = ["text-secondary", "text-muted", "status-critical", "accent"];
const CARRIES_MEANING = [
  "status-good",
  "status-warning",
  "status-critical",
  "accent",
  "chart-neutral",
  "state-neutral",
  "text-faint",
];

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

function stripeOver(fill: string, stripe: string, alpha: number): [number, number, number] {
  const [fillR, fillG, fillB] = toRgb255(fill);
  const [strR, strG, strB] = toRgb255(stripe);
  const blend = (over: number, under: number) => Math.round(alpha * over + (1 - alpha) * under);
  return [blend(strR, fillR), blend(strG, fillG), blend(strB, fillB)];
}

function stripePaint(tokens: Record<string, string>): { colour: string; alpha: number } {
  const block = tokens === light ? ":root {" : ':root[data-theme="dark"] {';
  const start = CSS.indexOf(block);
  const declaration = CSS.slice(start, CSS.indexOf("}", start)).match(
    /--stripe:\s*rgb\((\d+) (\d+) (\d+) \/ ([\d.]+)\)/,
  );
  if (!declaration) throw new Error(`--stripe is not declared in ${block}`);

  const [, r, g, b, alpha] = declaration;
  const hex = [r, g, b]
    .map((channelValue) => Number(channelValue).toString(16).padStart(2, "0"))
    .join("");
  return { colour: `#${hex}`, alpha: Number(alpha) };
}

describe("the fill textures stay visible against the colour they are painted on", () => {
  for (const [theme, tokens] of [
    ["light", light],
    ["dark", dark],
  ] as const) {
    const paint = stripePaint(tokens);

    for (const [state, presentation] of Object.entries(USAGE_PRESENTATION)) {
      if (presentation.pattern === "none") continue;

      it(`${theme}: the ${state} stripes read against its own fill`, () => {
        const fill = resolveColour(presentation.color, tokens);
        const [r, g, b] = stripeOver(fill, paint.colour, paint.alpha);
        const striped = `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;

        expect(contrast(striped, fill)).toBeGreaterThanOrEqual(GRAPHIC_CONTRAST);
      });
    }
  }
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
    for (const [theme, tokens] of [
      ["light", light],
      ["dark", dark],
    ] as const) {
      it(`${theme}: paints every ${name} state a colour no sibling state resolves to`, () => {
        const painted = Object.values(states).map((presentation) =>
          resolveColour(presentation.color, tokens),
        );
        expect(new Set(painted).size, `two ${name} states resolve to one colour`).toBe(
          painted.length,
        );
      });
    }

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
