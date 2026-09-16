import { describe, expect, it } from "vitest";
import { readWithUnixLineEndings } from "./helpers/source-text";
import { totalStickyHeight } from "../src/lib/ui/use-measured-sticky-height";

const CSS = readWithUnixLineEndings(new URL("../src/app/globals.css", import.meta.url));
const HOOK = readWithUnixLineEndings(
  new URL("../src/lib/ui/use-measured-sticky-height.ts", import.meta.url),
);
const INDEX = readWithUnixLineEndings(
  new URL("../src/components/StationsIndex.tsx", import.meta.url),
);

function parsedRules(): { selector: string; body: string }[] {
  return [...CSS.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => ({
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

function stickySelectors(): string[] {
  return parsedRules()
    .filter((rule) => /position:\s*sticky/.test(rule.body))
    .map((rule) => rule.selector);
}

describe("nothing sticky is allowed to sit on top of the focused element", () => {
  it("finds the sticky layers this has to clear", () => {
    const sticky = stickySelectors();

    expect(sticky, "no sticky element matched, so this suite proves nothing").not.toEqual([]);
    expect(sticky).toContain(".app-header");
    expect(sticky).toContain(".stations-controls");
  });

  it("reserves the header on every route", () => {
    const padding = ruleFor("html");

    expect(padding).toMatch(/scroll-padding-top:\s*calc\(/);
    expect(padding).toContain("var(--header-height)");
  });

  it("reserves the second layer only on the page that has one", () => {
    const scoped = ruleFor("html:has(.stations-controls)");

    expect(scoped).toContain("var(--header-height)");
    expect(scoped).toContain("var(--controls-height)");
  });

  it("stacks the second layer directly under the first", () => {
    expect(ruleFor(".stations-controls")).toMatch(/top:\s*var\(--header-height\)/);
  });
});

describe("the focus ring is reserved for, not just the element it surrounds", () => {
  it("draws every ring from the same two tokens", () => {
    const declared = [...CSS.matchAll(/outline:\s*([^;]+);/g)].map((match) => match[1].trim());
    const drawn = declared.filter((outline) => !/^(none|0)$/.test(outline));
    const removed = declared.filter((outline) => /^(none|0)$/.test(outline));
    const offsets = [...CSS.matchAll(/outline-offset:\s*([^;]+);/g)].map((match) => match[1].trim());

    expect(drawn.length, "no focus ring was examined").toBeGreaterThan(0);
    expect(offsets.length, "a drawn ring has no offset, or an offset has no ring").toBe(drawn.length);
    for (const ring of drawn) expect(ring).toContain("var(--focus-ring-width)");
    for (const offset of offsets) expect(offset).toBe("var(--focus-ring-offset)");

    if (removed.length > 0) {
      expect(CSS, "an outline is removed with no ring drawn in its place").toMatch(
        /:focus-visible[^{]*\{[^}]*outline:\s*var\(--focus-ring-width\)/,
      );
    }
  });

  it("adds the ring's own reach to what every reservation clears", () => {
    for (const selector of ["html", "html:has(.stations-controls)"]) {
      expect(
        ruleFor(selector),
        `${selector} reserves the sticky height but clips the ring drawn above it`,
      ).toContain("var(--focus-ring-space)");
    }
  });

  it("builds that reach from the tokens the ring is drawn with", () => {
    const space = CSS.match(/--focus-ring-space:\s*([^;]+);/)?.[1];

    expect(space, "the ring allowance is a number of its own, free to drift").toBeDefined();
    expect(space).toContain("var(--focus-ring-width)");
    expect(space).toContain("var(--focus-ring-offset)");
  });
});

describe("a bar that wraps is measured rather than guessed", () => {
  it("knows the bar can wrap, which is why a fixed token cannot describe it", () => {
    expect(ruleFor(".stations-controls")).toMatch(/flex-wrap:\s*wrap/);
  });

  it("publishes the measured height into the token the reservation reads", () => {
    expect(HOOK).toMatch(/new ResizeObserver\(/);
    expect(HOOK).toMatch(/observer\.observe\(measured\)/);
    expect(HOOK).toMatch(/setProperty\(token/);
    expect(INDEX).toContain('useMeasuredStickyHeight("--controls-height")');
  });

  it("adds the edges the observer's content box leaves out", () => {
    const edges = { paddingTop: 16, paddingBottom: 16, borderTop: 0, borderBottom: 1 };

    expect(totalStickyHeight(39, edges), "one row of controls").toBe(72);
    expect(totalStickyHeight(90, edges), "two rows, which is what a phone gets").toBe(123);
  });

  it("rounds up, so a fractional row is never reserved short", () => {
    const none = { paddingTop: 0, paddingBottom: 0, borderTop: 0, borderBottom: 0 };

    expect(totalStickyHeight(71.4, none)).toBe(72);
    expect(totalStickyHeight(72, none)).toBe(72);
  });

  it("never reserves a negative height", () => {
    const negative = { paddingTop: -100, paddingBottom: 0, borderTop: 0, borderBottom: 0 };

    expect(totalStickyHeight(10, negative)).toBe(0);
  });

  it("puts the measurement on the element the reservation is about", () => {
    expect(INDEX).toMatch(/className="stations-controls"\s+ref=\{controls\}/);
  });

  it("gives up the token when the bar goes away", () => {
    expect(HOOK).toMatch(/observer\.disconnect\(\);\s*\n\s*release\(\);/);
    expect(HOOK).toMatch(/const release = \(\) => root\.style\.removeProperty\(token\);/);
  });

  it("gives it up too when the browser has no observer to disconnect", () => {
    expect(HOOK).toMatch(/if \(typeof ResizeObserver === "undefined"\) return release;/);
  });

  it("still reserves something before the measurement can run", () => {
    const fallback = CSS.match(/--controls-height:\s*(\d+)px;/)?.[1];

    expect(fallback, "nothing is reserved until JavaScript runs").toBeDefined();
    expect(Number(fallback)).toBeGreaterThan(0);
  });
});
