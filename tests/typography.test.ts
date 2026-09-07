import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const LAYOUT = readFileSync(new URL("../src/app/layout.tsx", import.meta.url), "utf8");

describe("the redesign's typeface", () => {
  it("loads Chivo from next/font/google, self-hosted rather than the fonts.googleapis.com link", () => {
    expect(LAYOUT).toMatch(/import\s*\{\s*Chivo\s*\}\s*from\s*"next\/font\/google"/);
    expect(LAYOUT).not.toMatch(/fonts\.googleapis\.com/);
  });

  it("subsets latin and latin-ext, for the accents and ñ in station names", () => {
    const call = LAYOUT.match(/Chivo\(\{[\s\S]*?\}\)/)?.[0];
    expect(call, "Chivo(...) call not found").toBeDefined();
    expect(call).toMatch(/subsets:\s*\[[^\]]*"latin"[^\]]*"latin-ext"[^\]]*\]/);
  });

  it("ships the weights the design uses, and not the unused 300", () => {
    const call = LAYOUT.match(/Chivo\(\{[\s\S]*?\}\)/)?.[0];
    expect(call, "Chivo(...) call not found").toBeDefined();
    const weightList = call?.match(/weight:\s*\[([^\]]*)\]/)?.[1];
    expect(weightList, "no weight array on the Chivo(...) call").toBeDefined();
    const weights = weightList
      ?.split(",")
      .map((entry) => entry.trim().replace(/['"]/g, ""))
      .filter(Boolean);

    expect(weights?.sort()).toEqual(["400", "600", "800", "900"].sort());
  });

  it("still names the family through --font-body only, restated nowhere else", () => {
    expect(LAYOUT).toMatch(/variable:\s*"--font-body"/);
    expect(LAYOUT.match(/--font-body/g)?.length).toBe(1);
  });
});
