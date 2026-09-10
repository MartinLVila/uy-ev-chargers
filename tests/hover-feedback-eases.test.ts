import { describe, expect, it } from "vitest";
import { readWithUnixLineEndings } from "./helpers/source-text";

const CSS = readWithUnixLineEndings(new URL("../src/app/globals.css", import.meta.url));
const REDUCED_MOTION_GUARD = "@media (prefers-reduced-motion: no-preference)";

const ANIMATABLE_LONGHAND: Record<string, string> = {
  background: "background-color",
  border: "border-color",
  outline: "outline-color",
};

const NEVER_ANIMATES = new Set([
  "content",
  "cursor",
  "display",
  "overflow",
  "pointer-events",
  "position",
  "text-decoration-line",
  "user-select",
  "visibility",
  "will-change",
  "z-index",
]);

type Rule = { selectors: string[]; body: string };

function topLevelSplit(text: string, separator: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const character of text) {
    if (character === "(" || character === "[") depth += 1;
    if (character === ")" || character === "]") depth -= 1;
    if (character === separator && depth === 0) {
      parts.push(current.trim());
      current = "";
      continue;
    }
    current += character;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

function rules(): Rule[] {
  return [...CSS.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => ({
    selectors: topLevelSplit(match[1].trim().replace(/\s+/g, " "), ","),
    body: match[2],
  }));
}

function declaredProperties(body: string): string[] {
  return topLevelSplit(body, ";")
    .map((declaration) => declaration.split(":")[0].trim())
    .filter((property) => /^[a-z-]+$/.test(property));
}

function subjectOf(selector: string): string {
  const compounds = selector.split(/\s*[ >+~]\s*/).filter(Boolean);
  const last = compounds[compounds.length - 1] ?? selector;
  return last.split(/[:[]/)[0] || last;
}

function transitionParts(body: string): string[] {
  const declaration = body.match(/transition:\s*([^;]+);/);
  return declaration ? topLevelSplit(declaration[1], ",") : [];
}

function transitionedPropertiesFor(subject: string): Set<string> {
  const properties = new Set<string>();
  for (const rule of rules()) {
    const applies = rule.selectors.some(
      (selector) => selector === "*" || subjectOf(selector) === subject,
    );
    if (!applies) continue;
    for (const part of transitionParts(rule.body)) {
      const property = part.trim().split(/\s+/)[0];
      if (property) properties.add(property);
    }
  }
  return properties;
}

function hoverRules(): Rule[] {
  return rules().filter((rule) => rule.selectors.some((selector) => selector.includes(":hover")));
}

function transitionOf(selector: string): string {
  const declarations = rules()
    .filter((rule) => rule.selectors.length === 1 && rule.selectors[0] === selector)
    .map((rule) => rule.body.match(/transition:\s*([^;]+);/))
    .filter((match) => match !== null);

  if (declarations.length === 0) throw new Error(`no rule for ${selector} declares a transition`);
  if (declarations.length > 1) throw new Error(`${selector} declares a transition more than once`);
  return declarations[0][1].replace(/\s+/g, " ").trim();
}

function reducedMotionBlock(): string {
  const start = CSS.indexOf(REDUCED_MOTION_GUARD);
  if (start === -1) throw new Error("the stylesheet has no reduced-motion guard");

  const open = CSS.indexOf("{", start);
  let depth = 0;
  for (let index = open; index < CSS.length; index += 1) {
    if (CSS[index] === "{") depth += 1;
    if (CSS[index] === "}") {
      depth -= 1;
      if (depth === 0) return CSS.slice(open + 1, index);
    }
  }
  throw new Error("the reduced-motion guard is never closed");
}

describe("what a hover changes is a property that element eases", () => {
  it("finds hover rules to check at all", () => {
    expect(hoverRules().length, "no rule matched :hover, so this suite proves nothing").toBeGreaterThan(
      0,
    );
  });

  it("checks the transitions that reach the hovered element, not the whole stylesheet", () => {
    expect(
      transitionedPropertiesFor(".hud-locality"),
      "the map circle should reach its own fill-opacity transition",
    ).toContain("fill-opacity");
    expect(
      transitionedPropertiesFor(".theme-toggle"),
      "an element with no transition of its own must not inherit another element's",
    ).not.toContain("fill-opacity");
  });

  it("eases every property any hover rule changes", () => {
    const unexplained: string[] = [];
    let examined = 0;

    for (const rule of hoverRules()) {
      for (const selector of rule.selectors) {
        if (!selector.includes(":hover")) continue;
        const subject = subjectOf(selector);
        const eased = transitionedPropertiesFor(subject);

        for (const property of declaredProperties(rule.body)) {
          if (NEVER_ANIMATES.has(property)) continue;
          examined += 1;
          const animated = ANIMATABLE_LONGHAND[property] ?? property;
          if (!eased.has(animated)) unexplained.push(`${selector} changes ${property}`);
        }
      }
    }

    expect(examined, "no animatable property was examined, so this proves nothing").toBeGreaterThan(0);
    expect(unexplained, "a hover changes something that element does not ease, so it snaps").toEqual(
      [],
    );
  });
});

describe("interaction feedback is paced separately from the theme swap", () => {
  it("keeps the two durations apart", () => {
    const interaction = CSS.match(/--interaction:\s*([^;]+);/)?.[1].trim();
    const themeSwap = CSS.match(/--theme-swap:\s*([^;]+);/)?.[1].trim();

    expect(interaction, "there is no interaction duration to pace hover with").toBeDefined();
    expect(themeSwap).toBeDefined();
    expect(interaction, "one duration serving both jobs is what made hover feel slow").not.toBe(
      themeSwap,
    );
  });

  it("paces the two hover properties by feedback rather than by the swap", () => {
    expect(transitionOf("a")).toContain("text-decoration-thickness var(--feedback)");
    expect(transitionOf(".hud-locality")).toContain("fill-opacity var(--feedback)");
  });

  it("stops the row wash from being the one place with a hand-set duration", () => {
    const wash = transitionOf(".row-wash");

    expect(wash).toContain("background-color var(--feedback)");
    expect(wash, "a bare millisecond value is the drift this ticket removes").not.toMatch(/\d+ms/);
  });

  it("leaves the theme swap covering the colours on every rule that overrides it", () => {
    for (const selector of ["a", ".row-wash"]) {
      const declaration = transitionOf(selector);

      expect(declaration, `${selector} drops border-color from the theme swap`).toContain(
        "border-color var(--swap)",
      );
      expect(declaration, `${selector} drops color from the theme swap`).toContain(
        "color var(--swap)",
      );
    }
  });

  it("keeps the paint an svg anchor swaps, which the wider rule would otherwise carry", () => {
    const anchor = transitionOf("a");

    expect(anchor, "an anchor inside the map loses fill on a theme swap").toContain(
      "fill var(--swap)",
    );
    expect(anchor, "an anchor inside the map loses stroke on a theme swap").toContain(
      "stroke var(--swap)",
    );
  });

  it("removes the feedback rather than shortening it when the reader asks", () => {
    const guarded = reducedMotionBlock();

    expect(guarded).toContain("text-decoration-thickness var(--feedback)");
    expect(guarded).toContain("fill-opacity var(--feedback)");
    expect(guarded).toContain("background-color var(--feedback)");
  });
});
