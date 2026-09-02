import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const CI = readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
const POLL = readFileSync(new URL("../.github/workflows/poll.yml", import.meta.url), "utf8");
const SNAPSHOT = readFileSync(new URL("../.github/workflows/snapshot.yml", import.meta.url), "utf8");

function auditCommands(workflow: string): string[] {
  return [...workflow.matchAll(/run:\s*(npm audit[^\n]*)/g)].map((match) => match[1].trim());
}

describe("the audit covers the packages that hold the credential", () => {
  it("audits the whole tree, not only what ships to visitors", () => {
    const overWholeTree = auditCommands(CI).filter((command) => !command.includes("--omit=dev"));

    expect(overWholeTree, "every audit skips the development tree").not.toHaveLength(0);
  });

  it("fails the build rather than only reporting", () => {
    for (const command of auditCommands(CI)) {
      expect(command, `${command} cannot fail a check`).toMatch(/--audit-level=/);
      expect(command, `${command} only reports`).not.toMatch(/\|\|\s*true|continue-on-error/);
    }
  });

  it("still holds what visitors receive to a tighter standard than the toolchain", () => {
    const commands = auditCommands(CI);
    const shipped = commands.find((command) => command.includes("--omit=dev"));
    const everything = commands.find((command) => !command.includes("--omit=dev"));

    expect(shipped).toMatch(/--audit-level=moderate/);
    expect(everything).toMatch(/--audit-level=high/);
  });

  it("is worth having because the development tree runs next to DATABASE_URL", () => {
    for (const workflow of [POLL, SNAPSHOT]) {
      expect(workflow).toContain("npm ci");
      expect(workflow).toContain("secrets.DATABASE_URL");
      expect(workflow, "npm ci here would not install the audited tree").not.toContain(
        "npm ci --omit=dev",
      );
    }
  });
});
