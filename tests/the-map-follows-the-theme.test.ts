import { describe, expect, it } from "vitest";
import { readWithUnixLineEndings } from "./helpers/source-text";
import { contrastWhenPaintedOn, tokenValue, tokensInBlock } from "./helpers/colour";

const CSS = readWithUnixLineEndings(new URL("../src/app/globals.css", import.meta.url));

const SEPARATION = 3;
const DRAWS_SOMETHING = 1.25;

const light = tokensInBlock(CSS, ":root {");
const dark = tokensInBlock(CSS, ':root[data-theme="dark"] {');
const darkByPreference = tokensInBlock(CSS, ':root:not([data-theme="light"]) {');

const MAP_TOKENS = ["map-land", "map-neighbor", "map-outline", "map-scan"];

interface Paint {
  selector: string;
  property: string;
  value: string;
}

function mapPaints(): Paint[] {
  const paints: Paint[] = [];
  for (const rule of CSS.matchAll(/([^{}]*\.hud-[\w-]+[^{}]*)\{([^{}]*)\}/g)) {
    const selector = rule[1].trim().replace(/\s+/g, " ");
    for (const declaration of rule[2].matchAll(/\b(fill|stroke):\s*([^;]+);/g)) {
      paints.push({ selector, property: declaration[1], value: declaration[2].trim() });
    }
  }
  return paints;
}

const paints = mapPaints();
const selectors = new Set(paints.map((paint) => paint.selector));
const examined = `${selectors.size} map rules, ${paints.length} fills and strokes`;

describe("the map is painted from tokens, so it swaps with the rest of the page", () => {
  it("sweeps a map rule at all, rather than reporting clean on nothing", () => {
    expect(selectors.size, examined).toBeGreaterThanOrEqual(8);
    expect([...selectors]).toContain(".hud-country-uruguay");
    expect([...selectors]).toContain(".hud-scan-line");
  });

  it("paints every map surface through a token rather than a literal colour", () => {
    const literals = paints
      .filter((paint) => !/^(var\(--[\w-]+\)|none|transparent|inherit|currentColor)$/.test(paint.value))
      .map((paint) => `${paint.selector} { ${paint.property}: ${paint.value} }`);

    expect(literals, examined).toEqual([]);
  });

  for (const token of MAP_TOKENS) {
    it(`gives --${token} a value of its own in light and in dark`, () => {
      expect(tokenValue(light, token)).not.toBe(tokenValue(dark, token));
      expect(darkByPreference[token], `--${token} drifted between the two dark blocks`).toBe(
        dark[token],
      );
    });
  }
});

describe("the country is separated from the water it floats on, in either theme", () => {
  for (const [theme, tokens] of [
    ["light", light],
    ["dark", dark],
  ] as const) {
    it(`${theme}: the coastline reads against the land it encloses`, () => {
      expect(
        contrastWhenPaintedOn(tokenValue(tokens, "map-outline"), tokenValue(tokens, "map-land")),
      ).toBeGreaterThanOrEqual(SEPARATION);
    });

    it(`${theme}: the scan line draws something rather than nothing`, () => {
      expect(
        contrastWhenPaintedOn(tokenValue(tokens, "map-scan"), tokenValue(tokens, "map-land")),
      ).toBeGreaterThanOrEqual(DRAWS_SOMETHING);
    });

    for (const marker of ["status-good", "status-critical", "chart-neutral"]) {
      it(`${theme}: a locality's --${marker} ring reads against --map-land`, () => {
        expect(
          contrastWhenPaintedOn(tokenValue(tokens, marker), tokenValue(tokens, "map-land")),
        ).toBeGreaterThanOrEqual(SEPARATION);
      });
    }
  }
});
