import { describe, expect, it } from "vitest";
import { readWithUnixLineEndings } from "./helpers/source-text";
import { contrast, tokensInBlock } from "./helpers/colour";

const CSS = readWithUnixLineEndings(new URL("../src/app/globals.css", import.meta.url));

const GRAPHIC_CONTRAST = 3;

const light = tokensInBlock(CSS, ":root {");
const dark = tokensInBlock(CSS, ':root[data-theme="dark"] {');
const darkByPreference = tokensInBlock(CSS, ':root:not([data-theme="light"]) {');

const MAP_TOKENS = ["map-land", "map-neighbor", "map-outline", "map-scan"];

const MAP_RULES = [
  ".hud-map-ground",
  ".hud-country-uruguay",
  ".hud-country-neighbor",
  ".hud-scan-line",
];

const TOP_LEVEL_RULES = new Map<string, string>();
for (const rule of CSS.matchAll(/(?:^|\n)([.#][\w-]+)\s*\{([^}]*)\}/g)) {
  TOP_LEVEL_RULES.set(rule[1], (TOP_LEVEL_RULES.get(rule[1]) ?? "") + rule[2]);
}

function paintedValues(selector: string): string[] {
  const body = TOP_LEVEL_RULES.get(selector);
  if (body === undefined) throw new Error(`no rule for ${selector}`);

  return [...body.matchAll(/\b(?:fill|stroke):\s*([^;]+);/g)].map((match) => match[1].trim());
}

function tokenValue(tokens: Record<string, string>, name: string): string {
  const value = tokens[name];
  if (!value) throw new Error(`--${name} is not declared`);
  return value;
}

describe("the map is painted from tokens, so it swaps with the rest of the page", () => {
  const painted = MAP_RULES.flatMap((selector) =>
    paintedValues(selector).map((value) => `${selector}: ${value}`),
  );
  const examined = `${MAP_RULES.length} rules, ${painted.length} fills and strokes, ${MAP_TOKENS.length} tokens`;

  it("paints every map surface through a token rather than a literal colour", () => {
    const literals = painted.filter((entry) => !/var\(--[\w-]+\)$/.test(entry));

    expect(literals, examined).toEqual([]);
  });

  it("finds at least one paint on every map rule, rather than sweeping nothing", () => {
    expect(painted.length, examined).toBeGreaterThanOrEqual(MAP_RULES.length);
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

describe("a locality circle stays visible against the land it sits on", () => {
  for (const [theme, tokens] of [
    ["light", light],
    ["dark", dark],
  ] as const) {
    for (const marker of ["status-good", "status-critical", "chart-neutral"]) {
      it(`${theme}: --${marker} reads against --map-land`, () => {
        expect(
          contrast(tokenValue(tokens, marker), tokenValue(tokens, "map-land")),
        ).toBeGreaterThanOrEqual(GRAPHIC_CONTRAST);
      });
    }
  }
});
