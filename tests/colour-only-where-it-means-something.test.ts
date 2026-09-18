import { describe, expect, it } from "vitest";
import { colourWhenPresent } from "../src/lib/ui/health";
import { readWithUnixLineEndings } from "./helpers/source-text";

const STATION_PAGE = readWithUnixLineEndings(
  new URL("../src/app/estaciones/[slug]/page.tsx", import.meta.url),
);

function stationStatCalls(): string[] {
  return [...STATION_PAGE.matchAll(/<StationStat\b([^>]*?)\/?>/g)].map((match) => match[1]);
}

describe("a status colour reports the count it sits on, rather than labelling the row", () => {
  it("drops the colour when there is nothing to report", () => {
    expect(colourWhenPresent(0, "var(--status-good)")).toBeUndefined();
  });

  it("keeps it when there is", () => {
    expect(colourWhenPresent(2, "var(--status-good)")).toBe("var(--status-good)");
  });

  it("treats a negative count as nothing to report rather than as something", () => {
    expect(colourWhenPresent(-1, "var(--status-critical)")).toBeUndefined();
  });
});

describe("every figure on a station page follows that rule, not just the ones fixed by hand", () => {
  const calls = stationStatCalls();
  const coloured = calls.filter((call) => /\bcolor=/.test(call));
  const examined = `${calls.length} StationStat call sites, ${coloured.length} of them coloured`;

  it("finds the figures to check, rather than reporting clean on an empty sweep", () => {
    expect(calls.length, examined).toBeGreaterThanOrEqual(4);
    expect(coloured.length, examined).toBeGreaterThan(0);
  });

  it("routes every colour through the rule instead of applying it unconditionally", () => {
    const unconditional = coloured.filter((call) => !/color=\{colourWhenPresent\(/.test(call));

    expect(unconditional, examined).toEqual([]);
  });
});
