import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const CSS = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");

const REDUCED_MOTION_GUARD = "@media (prefers-reduced-motion: no-preference)";
const VIEW_TIMELINE_GUARD = "@supports (animation-timeline: view())";

function blockAfter(marker: string): string {
  const start = CSS.indexOf(marker);
  if (start === -1) throw new Error(`no block introduced by ${marker}`);

  const open = CSS.indexOf("{", start);
  let depth = 0;
  for (let index = open; index < CSS.length; index += 1) {
    if (CSS[index] === "{") depth += 1;
    if (CSS[index] === "}") {
      depth -= 1;
      if (depth === 0) return CSS.slice(open + 1, index);
    }
  }
  throw new Error(`unbalanced braces after ${marker}`);
}

function keyframeBodies(): string[] {
  return [...CSS.matchAll(/@keyframes\s+[\w-]+\s*\{/g)].map((match) => blockAfter(match[0]));
}

const motion = blockAfter(REDUCED_MOTION_GUARD);
const outsideMotion = keyframeBodies().reduce(
  (css, body) => css.replace(body, ""),
  CSS.replace(motion, ""),
);

const MOVING_PROPERTIES = /(^|[\s;{])(animation|transition)(-[\w-]+)?\s*:/g;

describe("reduced motion removes the motion rather than shortening it", () => {
  it("declares every animation and transition inside the reduced-motion guard", () => {
    const strays = [...outsideMotion.matchAll(MOVING_PROPERTIES)].map((match) => match[0].trim());
    expect(strays, "motion declared where prefers-reduced-motion cannot switch it off").toEqual([]);
  });

  it("actually puts something inside that guard", () => {
    expect(motion).toMatch(/animation:/);
    expect(motion).toMatch(/transition:/);
  });
});

describe("the page is never left invisible waiting for motion that may not arrive", () => {
  it("keeps the scroll-linked entrance behind a support query", () => {
    const supported = blockAfter(VIEW_TIMELINE_GUARD);
    expect(supported).toMatch(/animation-timeline:\s*view\(\)/);

    const declarations = CSS.split(VIEW_TIMELINE_GUARD).join("");
    const timelineUses = [...declarations.matchAll(/animation-timeline\s*:/g)].length;
    const insideSupport = [...supported.matchAll(/animation-timeline\s*:/g)].length;
    expect(timelineUses, "a view timeline is set outside the support query").toBe(insideSupport);
  });

  it("never hides an element outside a keyframe", () => {
    const hidden = [...outsideMotion.matchAll(/opacity\s*:\s*0(\.0+)?\s*[;}]/g)];
    expect(hidden.map((match) => match[0]), "content hidden before it animates").toEqual([]);
  });
});

describe("one easing curve carries every movement", () => {
  it("defines the curve once and never inlines another", () => {
    const curves = [...CSS.matchAll(/cubic-bezier\([^)]*\)/g)].map((match) => match[0]);
    expect(new Set(curves).size).toBe(1);
    expect(curves).toHaveLength(1);
  });

  it("times every animation and transition off that curve", () => {
    const timed = [...motion.matchAll(/(animation|transition):\s*([^;]+);/g)].map(
      (match) => match[2],
    );

    expect(timed.length).toBeGreaterThan(0);
    for (const declaration of timed) {
      if (declaration.includes("linear")) continue;
      expect(declaration, `${declaration} does not use the shared curve`).toContain("var(--ease)");
    }
  });
});
