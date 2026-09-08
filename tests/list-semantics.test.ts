import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ConnectorStateStrip } from "../src/components/ConnectorStateStrip";

const SOURCE = fileURLToPath(new URL("../src", import.meta.url));
const CSS = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");

const LIST_OPENER = /<(ul|ol)\b/g;

function openingListTags(source: string): string[] {
  const tags: string[] = [];
  LIST_OPENER.lastIndex = 0;

  for (let opener = LIST_OPENER.exec(source); opener; opener = LIST_OPENER.exec(source)) {
    let braces = 0;
    let quote = "";

    for (let index = opener.index; index < source.length; index += 1) {
      const character = source[index];

      if (quote) {
        if (character === quote) quote = "";
      } else if (character === '"' || character === "'" || character === "`") {
        quote = character;
      } else if (character === "{") {
        braces += 1;
      } else if (character === "}") {
        braces -= 1;
      } else if (character === ">" && braces === 0) {
        tags.push(source.slice(opener.index, index + 1));
        break;
      }
    }
  }

  return tags;
}

function componentFiles(): string[] {
  return readdirSync(SOURCE, { recursive: true, encoding: "utf8" })
    .filter((entry) => entry.endsWith(".tsx"))
    .map((entry) => entry.replace(/\\/g, "/"));
}

function listTagsIn(name: string): string[] {
  return openingListTags(readFileSync(join(SOURCE, name), "utf8"));
}

describe("the list reset does not cost the lists their semantics", () => {
  it("still resets the marker, which is what the layout wants", () => {
    expect(CSS).toMatch(/ol,\s*ul\s*\{\s*list-style:\s*none/);
  });

  it("reads a whole opening tag, not just as far as the first angle bracket", () => {
    const withAnArrowFunction = `<ul role="list" onClick={() => close()} style={{ margin: 0 }}>`;

    expect(openingListTags(withAnArrowFunction)).toEqual([withAnArrowFunction]);
  });

  it("does not lose its place on a brace inside a string, and skip a list entirely", () => {
    const braceInAnAttribute = `<ul title="abre con { y no cierra" role="list">`;
    const plainOne = `<ul>`;

    expect(openingListTags(`${braceInAnAttribute}\n${plainOne}`)).toEqual([
      braceInAnAttribute,
      plainOne,
    ]);
  });

  it("finds the lists whose item count is the information", () => {
    const withLists = componentFiles().filter((name) => listTagsIn(name).length > 0);

    expect(withLists).toContain("components/ConnectorStateStrip.tsx");
    expect(withLists).toContain("components/HudMapView.tsx");
    expect(withLists).toContain("components/HistoryChart.tsx");
    expect(withLists).toContain("components/StationsIndex.tsx");
    expect(withLists).toContain("app/estaciones/[slug]/page.tsx");
  });

  for (const name of componentFiles()) {
    const tags = listTagsIn(name);
    if (tags.length === 0) continue;

    it(`keeps every list in ${name} announced as one`, () => {
      for (const tag of tags) {
        expect(tag, `${name} has a list Safari would drop the role from`).toContain('role="list"');
      }
    });
  }
});

describe("a rendered list carries the role", () => {
  it("announces the connector health breakdown as a list", () => {
    const markup = renderToStaticMarkup(
      createElement(ConnectorStateStrip, {
        segments: [
          { health: "operational", count: 554 },
          { health: "faulted", count: 27 },
          { health: "unknown", count: 15 },
        ],
      }),
    );

    expect(markup).toContain('role="list"');
    expect(markup.split("<li").length - 1).toBe(3);
  });
});
