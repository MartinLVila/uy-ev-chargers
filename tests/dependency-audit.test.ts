import { readWithUnixLineEndings } from "./helpers/source-text";
import { describe, expect, it } from "vitest";

const CI = readWithUnixLineEndings(new URL("../.github/workflows/ci.yml", import.meta.url));
const POLL = readWithUnixLineEndings(new URL("../.github/workflows/poll.yml", import.meta.url));
const SNAPSHOT = readWithUnixLineEndings(new URL("../.github/workflows/snapshot.yml", import.meta.url));
const AUDIT = readWithUnixLineEndings(new URL("../.github/workflows/audit.yml", import.meta.url));

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

function gatingAuditLines(workflow: string): string[] {
  return [...workflow.matchAll(/npm audit[^\n]*/g)]
    .map((match) => match[0].trim())
    .filter((line) => line.includes("--audit-level="))
    .sort();
}

function withoutRedirection(line: string): string {
  return line.replace(/\s*\d?[<>].*$/, "").trim();
}

function jobThatInstallsDependencies(workflow: string): string {
  const job = workflow.split(/^  [a-z-]+:$/m).find((block) => block.includes("npm ci"));
  if (!job) throw new Error("no job in this workflow installs dependencies");
  return job;
}

describe("something tells a person when the audit turns red on its own", () => {
  it("runs on a schedule, since nothing else will notice a database that moved", () => {
    expect(AUDIT).toMatch(/on:\n\s+schedule:\n\s+- cron:/);
  });

  it("watches exactly the gates CI enforces, so the alert cannot drift looser", () => {
    const enforced = gatingAuditLines(CI).map(withoutRedirection);

    expect(enforced.length, "CI enforces no audit gate at all").toBeGreaterThan(0);
    expect(gatingAuditLines(AUDIT).map(withoutRedirection)).toEqual(enforced);
  });

  it("fails its own run rather than only filing a report", () => {
    expect(AUDIT).toMatch(/failing == 'yes'\n\s+run: exit 1/);
  });

  it("never lets a gating audit swallow its own exit code", () => {
    const lines = gatingAuditLines(AUDIT);

    expect(lines.length, "the alert runs no gating audit at all").toBeGreaterThan(0);
    for (const line of lines) {
      expect(line, `${line} swallows its own exit code`).not.toMatch(/\|\|\s*(true|:)/);
    }
  });

  it("takes the one write it needs and nothing else", () => {
    expect(AUDIT).toMatch(/^permissions: \{\}$/m);
    expect(AUDIT).toContain("issues: write");
    expect(AUDIT).toContain("contents: read");
    expect(AUDIT, "the alert can write to the repository").not.toContain("contents: write");
  });

  it("keeps the write token out of the job that installs dependencies", () => {
    expect(
      jobThatInstallsDependencies(AUDIT),
      "the job running npm ci also holds a token that can write issues",
    ).not.toContain("issues: write");
  });

  it("pins every action it runs to a commit, not a moving tag", () => {
    const used = [...AUDIT.matchAll(/uses: (\S+)/g)].map((match) => match[1]);

    expect(used.length, "the workflow runs no action, so nothing was checked").toBeGreaterThan(0);
    for (const action of used) {
      expect(action, `${action} is not pinned to a commit`).toMatch(/@[0-9a-f]{40}$/);
    }
  });
});
