import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const LAYOUT = readFileSync(new URL("../src/app/layout.tsx", import.meta.url), "utf8");
const THEME_SCRIPT = readFileSync(new URL("../public/theme.js", import.meta.url), "utf8");

const themeScriptTag = /<script\s+src="\/theme\.js"[^>]*\/>/;

function applyStoredTheme(stored: string | null): string | undefined {
  const documentElement = { dataset: {} as { theme?: string } };
  const localStorage = { getItem: () => stored };
  new Function("document", "localStorage", "console", THEME_SCRIPT)(
    { documentElement },
    localStorage,
    { warn: () => {} },
  );
  return documentElement.dataset.theme;
}

describe("the chosen theme is applied before the page first paints", () => {
  it("loads the theme script with a tag that blocks the parser until it has run", () => {
    const tag = LAYOUT.match(themeScriptTag);

    expect(tag, "the theme script is no longer loaded from the layout").not.toBeNull();
    expect(tag?.[0]).not.toMatch(/\basync\b/);
    expect(tag?.[0]).not.toMatch(/\bdefer\b/);
  });

  it("does not route the theme script through next/script, which runs it after hydration", () => {
    expect(LAYOUT).not.toMatch(/from "next\/script"/);
    expect(LAYOUT).not.toMatch(/beforeInteractive/);
  });

  it("runs the theme script ahead of everything the reader can see", () => {
    const script = LAYOUT.search(themeScriptTag);
    const firstMarkup = LAYOUT.indexOf("<header");

    expect(script).toBeGreaterThan(-1);
    expect(firstMarkup).toBeGreaterThan(-1);
    expect(script).toBeLessThan(firstMarkup);
  });
});

describe("the theme script only ever writes a theme it recognises", () => {
  it("applies a stored choice", () => {
    expect(applyStoredTheme("dark")).toBe("dark");
    expect(applyStoredTheme("light")).toBe("light");
  });

  it("leaves the system preference in charge when nothing is stored", () => {
    expect(applyStoredTheme(null)).toBeUndefined();
  });

  it("refuses anything that is not one of the two themes", () => {
    for (const stored of ["", "Dark", "system", "dark ", '"><script>', "__proto__"]) {
      expect(applyStoredTheme(stored), `${stored} reached the document`).toBeUndefined();
    }
  });
});
