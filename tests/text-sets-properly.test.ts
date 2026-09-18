import { readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { readWithUnixLineEndings } from "./helpers/source-text";

const CSS = readWithUnixLineEndings(new URL("../src/app/globals.css", import.meta.url));
const SOURCE = fileURLToPath(new URL("../src", import.meta.url));

function withoutAtRuleBlocks(css: string): string {
  let stripped = "";
  let index = 0;
  while (index < css.length) {
    if (css[index] !== "@") {
      stripped += css[index];
      index += 1;
      continue;
    }
    const open = css.indexOf("{", index);
    if (open === -1) break;

    let depth = 0;
    let cursor = open;
    for (; cursor < css.length; cursor += 1) {
      if (css[cursor] === "{") depth += 1;
      if (css[cursor] === "}") {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    index = cursor + 1;
  }
  return stripped;
}

function parsedRules(): { selector: string; body: string }[] {
  return [...withoutAtRuleBlocks(CSS).matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => ({
    selector: match[1].trim().replace(/\s+/g, " "),
    body: match[2],
  }));
}

function ruleFor(selector: string): string {
  const matching = parsedRules().filter((rule) => rule.selector === selector);

  if (matching.length === 0) throw new Error(`the stylesheet has no rule for ${selector}`);
  if (matching.length > 1) throw new Error(`${selector} is declared ${matching.length} times`);
  return matching[0].body;
}

function componentFiles(): string[] {
  return readdirSync(SOURCE, { recursive: true, encoding: "utf8" }).filter((entry) =>
    entry.endsWith(".tsx"),
  );
}

const COMPONENTS = componentFiles();
const MARKUP = COMPONENTS.map((file) => readWithUnixLineEndings(join(SOURCE, file)));

function countAcross(pattern: RegExp): number {
  return MARKUP.reduce((total, text) => total + (text.match(pattern) || []).length, 0);
}

function elementsCarrying(className: string): string[] {
  const opener = new RegExp(`<[a-zA-Z][^>]*className="${className}"[^>]*>`, "g");
  return MARKUP.flatMap((text) => text.match(opener) ?? []);
}

describe("prose is bounded so a line stays readable", () => {
  it("has components to look at", () => {
    expect(COMPONENTS.length, "no component was read, so the counts below mean nothing").toBeGreaterThan(
      0,
    );
  });

  it("caps the measure on the class rather than at the call site", () => {
    expect(ruleFor(".support-text")).toMatch(/max-width:\s*var\(--measure\)/);
  });

  it("states the measure in a unit that follows the font size", () => {
    const measure = CSS.match(/--measure:\s*([^;]+);/)?.[1].trim();

    expect(measure, "there is no measure to cap with").toBeDefined();
    expect(measure, "a pixel cap stops following the text it bounds").toMatch(/^\d+(\.\d+)?ch$/);
  });

  it("keeps that cap inside the range a reader can track", () => {
    const characters = Number(CSS.match(/--measure:\s*([\d.]+)ch/)?.[1]);

    expect(characters).toBeGreaterThanOrEqual(45);
    expect(characters).toBeLessThanOrEqual(80);
  });

  it("leaves no call site restating the cap on the text the class bounds", () => {
    const callSites = elementsCarrying("support-text");
    const capped = callSites.filter((element) => /maxWidth:\s*(\d|["'`])/.test(element));

    expect(callSites.length, "no support text was found, so this proves nothing").toBeGreaterThan(0);
    expect(capped, "a call site caps its own width, so the class no longer decides").toEqual([]);
  });
});

describe("headings and prose wrap the way a typesetter would", () => {
  it("balances every heading from one rule", () => {
    const headings = parsedRules().find((rule) => /^h1, ?h2, ?h3, ?h4, ?h5, ?h6$/.test(rule.selector));

    expect(headings, "the base heading rule moved, so nothing balances").toBeDefined();
    expect(headings?.body).toMatch(/text-wrap:\s*balance/);
  });

  it("asks prose for a good last line rather than a balanced block", () => {
    expect(ruleFor(".support-text")).toMatch(/text-wrap:\s*pretty/);
  });

  it("never forces a wrap by hand", () => {
    expect(countAcross(/&nbsp;/g), "a non-breaking space is a wrap decided for every width").toBe(0);
    expect(countAcross(/<br\s*\/?>/g), "a line break is a wrap decided for every width").toBe(0);
  });
});
