import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const CI = readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
const POLL = readFileSync(new URL("../.github/workflows/poll.yml", import.meta.url), "utf8");
const SNAPSHOT = readFileSync(new URL("../.github/workflows/snapshot.yml", import.meta.url), "utf8");

const SEVERITY = ["low", "moderate", "high", "critical"];

interface AuditStep {
  body: string;
  command: string;
}

function auditSteps(workflow: string): AuditStep[] {
  return workflow
    .split(/\n {6}- /)
    .slice(1)
    .filter((body) => /npm audit/.test(body))
    .map((body) => ({ body, command: (body.match(/npm audit[^\n]*/) ?? [""])[0].trim() }));
}

function severityOf(command: string): number {
  const level = command.match(/--audit-level=(\w+)/)?.[1] ?? "";
  const rank = SEVERITY.indexOf(level);
  if (rank === -1) throw new Error(`${command} names no known audit level`);
  return rank;
}

function shippedAndEverything(): { shipped: AuditStep; everything: AuditStep } {
  const steps = auditSteps(CI);
  const shipped = steps.find((step) => step.command.includes("--omit=dev"));
  const everything = steps.find((step) => !step.command.includes("--omit=dev"));
  if (!shipped || !everything) throw new Error("CI does not audit both surfaces");
  return { shipped, everything };
}

describe("the audit covers the packages that hold the credential", () => {
  it("audits the whole tree, not only what ships to visitors", () => {
    const overWholeTree = auditSteps(CI).filter((step) => !step.command.includes("--omit=dev"));

    expect(overWholeTree, "every audit skips the development tree").not.toHaveLength(0);
  });

  it("fails the build rather than only reporting", () => {
    const steps = auditSteps(CI);
    expect(steps.length).toBeGreaterThan(0);

    for (const step of steps) {
      expect(step.command, `${step.command} cannot fail a check`).toMatch(/--audit-level=/);
      expect(step.command, `${step.command} swallows its own exit code`).not.toMatch(/\|\|\s*true/);
      expect(step.body, `${step.command} is allowed to fail without failing CI`).not.toMatch(
        /continue-on-error/,
      );
    }
  });

  it("holds what visitors receive to a standard no looser than the toolchain", () => {
    const { shipped, everything } = shippedAndEverything();

    expect(severityOf(shipped.command)).toBeLessThanOrEqual(severityOf(everything.command));
  });

  it("reports both surfaces in one run rather than hiding the second", () => {
    const { everything } = shippedAndEverything();

    expect(everything.body, "a failure in the shipped tree hides the credential-adjacent one").toMatch(
      /if:\s*always\(\)/,
    );
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
