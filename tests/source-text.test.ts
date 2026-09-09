import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { readWithUnixLineEndings } from "./helpers/source-text";

const CARRIAGE_RETURN = String.fromCharCode(13);

const directories: string[] = [];

function fileContaining(text: string): string {
  const directory = mkdtempSync(path.join(tmpdir(), "source-text-"));
  directories.push(directory);

  const file = path.join(directory, "sample.css");
  writeFileSync(file, text);
  return file;
}

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("a test that matches source text sees the same bytes on every checkout", () => {
  it("reads a Windows checkout as the line endings the patterns are written for", () => {
    const windows = `  * {${CARRIAGE_RETURN}\n    transition:${CARRIAGE_RETURN}\n      color 1ms;${CARRIAGE_RETURN}\n`;

    const text = readWithUnixLineEndings(pathToFileURL(fileContaining(windows)));

    expect(text).toBe("  * {\n    transition:\n      color 1ms;\n");
  });

  it("finds a marker spanning two lines, which is what a raw read misses", () => {
    const windows = `}${CARRIAGE_RETURN}\n  * {${CARRIAGE_RETURN}\n    transition:${CARRIAGE_RETURN}\n`;

    const text = readWithUnixLineEndings(pathToFileURL(fileContaining(windows)));

    expect(text.indexOf("\n  * {\n    transition:")).toBeGreaterThan(-1);
  });

  it("leaves a checkout that already uses Unix line endings exactly as it found it", () => {
    const unix = "  * {\n    transition:\n      color 1ms;\n";

    expect(readWithUnixLineEndings(pathToFileURL(fileContaining(unix)))).toBe(unix);
  });

  it("reads a plain path as readily as a file URL, so no caller falls back to a raw read", () => {
    expect(readWithUnixLineEndings(fileContaining(`a${CARRIAGE_RETURN}\nb`))).toBe("a\nb");
  });
});
