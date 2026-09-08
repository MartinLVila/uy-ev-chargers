import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const CSS = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");

const GROUND_AND_INK = ["background-color", "border-color", "color"];
const PAINT = ["fill", "stroke"];

interface Rule {
  selectors: string[];
  body: string;
}

function splitOutsideBrackets(text: string, separator: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let part = "";

  for (const character of text) {
    if (character === "(") depth += 1;
    if (character === ")") depth -= 1;

    if (character === separator && depth === 0) {
      parts.push(part.trim());
      part = "";
      continue;
    }
    part += character;
  }

  parts.push(part.trim());
  return parts.filter((entry) => entry.length > 0);
}

function ruleAround(marker: string): Rule {
  const found = CSS.indexOf(marker);
  if (found === -1) throw new Error(`the stylesheet has no ${marker}`);

  const previousRule = Math.max(CSS.lastIndexOf("}", found), CSS.lastIndexOf("{", found));
  const opens = CSS.indexOf("{", found);
  if (opens === -1) throw new Error(`${marker} opens no rule`);

  let depth = 0;
  let closes = opens;
  for (; closes < CSS.length; closes += 1) {
    if (CSS[closes] === "{") depth += 1;
    if (CSS[closes] === "}") {
      depth -= 1;
      if (depth === 0) break;
    }
  }
  if (depth !== 0) throw new Error(`the rule for ${marker} is never closed`);

  return {
    selectors: splitOutsideBrackets(CSS.slice(previousRule + 1, opens), ","),
    body: CSS.slice(opens + 1, closes),
  };
}

function transitioned(rule: Rule): string[] {
  const start = rule.body.indexOf("transition:");
  if (start === -1) throw new Error(`${rule.selectors.join(", ")} declares no transition`);

  const declaration = rule.body.slice(start + "transition:".length, rule.body.indexOf(";", start));

  return splitOutsideBrackets(declaration, ",").map((entry) => entry.split(/\s+/)[0]);
}

const everyElement = ruleAround("\n  * {\n    transition:");
const everySvg = ruleAround("\n  svg,\n  svg * {");

describe("the theme swap tracks the properties that change, on the elements that have them", () => {
  it("moves ground, border and ink together on every element, and nothing else", () => {
    expect(transitioned(everyElement)).toEqual(GROUND_AND_INK);
  });

  it("adds paint only where an element can be painted", () => {
    expect(transitioned(everySvg)).toEqual([...GROUND_AND_INK, ...PAINT]);
  });

  it("reaches the shapes inside an svg, which set their own fill rather than inheriting it", () => {
    expect(everySvg.selectors).toEqual(["svg", "svg *"]);
  });
});
