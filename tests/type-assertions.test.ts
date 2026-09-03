import { readdirSync } from "node:fs";
import { basename } from "node:path";
import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const REPOSITORY = fileURLToPath(new URL("..", import.meta.url));
const TESTS = fileURLToPath(new URL(".", import.meta.url));
const RESTRICTIONS = new Set(["no-restricted-syntax", "no-restricted-imports"]);

const SPELLINGS = {
  "a plain call": ['import { expectTypeOf } from "vitest";', "expectTypeOf<string>();"],
  "an aliased import": ['import { expectTypeOf as pin } from "vitest";', "pin<string>();"],
  "a namespace import": ['import * as suite from "vitest";', "suite.expectTypeOf<string>();"],
  "assertType rather than expectTypeOf": [
    'import { assertType } from "vitest";',
    'assertType<string>("x");',
  ],
} as const;

async function restrictionsOn(source: string, filePath: string): Promise<string[]> {
  const [result] = await new ESLint({ cwd: REPOSITORY }).lintText(source, { filePath });
  return result.messages
    .filter((message) => message.ruleId !== null && RESTRICTIONS.has(message.ruleId))
    .map((message) => message.message);
}

function typeTestFiles(): string[] {
  return readdirSync(TESTS, { recursive: true, encoding: "utf8" }).filter((name) =>
    /\.test-d\.tsx?$/.test(name),
  );
}

describe("a type assertion has to live where something checks it", () => {
  for (const [spelling, lines] of Object.entries(SPELLINGS)) {
    const source = `${lines.join("\n")}\n`;

    it(`refuses ${spelling} in a suite vitest runs, where it is erased`, async () => {
      const complaints = await restrictionsOn(source, "tests/a-runtime-suite.test.ts");

      expect(complaints.length).toBeGreaterThan(0);
      expect(complaints.every((complaint) => complaint.includes("*.test-d.ts"))).toBe(true);
    });

    it(`allows ${spelling} in a type test`, async () => {
      expect(await restrictionsOn(source, "tests/a-type-test.test-d.ts")).toEqual([]);
    });
  }

  it("allows a type test that needs JSX to be spelled .test-d.tsx", async () => {
    const source = `${SPELLINGS["a plain call"].join("\n")}\n`;

    expect(await restrictionsOn(source, "tests/a-component-type-test.test-d.tsx")).toEqual([]);
  });

  it("keeps every type test inside the reach of tsc", () => {
    const configPath = ts.findConfigFile(REPOSITORY, ts.sys.fileExists, "tsconfig.json");
    if (!configPath) throw new Error("tsconfig.json is not where this test expects it");

    const { config } = ts.readConfigFile(configPath, ts.sys.readFile);
    const { fileNames } = ts.parseJsonConfigFileContent(config, ts.sys, REPOSITORY);
    const checked = new Set(fileNames.map((name) => basename(name)));

    const typeTests = typeTestFiles();
    expect(typeTests.length).toBeGreaterThan(0);

    for (const name of typeTests) {
      expect(checked.has(basename(name))).toBe(true);
    }
  });
});
