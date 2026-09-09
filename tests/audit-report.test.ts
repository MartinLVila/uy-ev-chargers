import { describe, expect, it } from "vitest";
import {
  auditReportBody,
  exitCodeFrom,
  isFailing,
  withinBudget,
  OUTPUT_CHARACTER_BUDGET,
  type AuditedGate,
} from "../scripts/audit-report";

function gate(overrides: Partial<AuditedGate> = {}): AuditedGate {
  return {
    surface: "What ships to visitors",
    command: "npm audit --omit=dev --audit-level=moderate",
    audits: "production only",
    exitCode: 0,
    output: "found 0 vulnerabilities",
    metadata: {
      vulnerabilities: { critical: 0, high: 0, moderate: 0, low: 0, info: 0, total: 0 },
      dependencies: { prod: 31, dev: 504, total: 572 },
    },
    ...overrides,
  };
}

const RUN = "https://github.com/owner/repo/actions/runs/1";

describe("the alert says which surface every number describes", () => {
  it("counts only the production packages for the gate that audits only those", () => {
    const body = auditReportBody([gate({ audits: "production only" })], RUN);

    expect(body).toContain("Packages audited: 31 production, out of 572 installed.");
  });

  it("counts the whole tree for the gate that audits the whole tree", () => {
    const body = auditReportBody([gate({ audits: "the whole installed tree" })], RUN);

    expect(body).toContain(
      "Packages audited: 572 installed — 31 production and 504 development.",
    );
  });

  it("says the size is unknown rather than implying nothing was found in nothing", () => {
    const body = auditReportBody([gate({ metadata: null })], RUN);

    expect(body).toContain("The size of the audited tree is unknown");
    expect(body).toContain("Severity counts are unknown");
    expect(body).not.toContain("Packages audited: 0");
  });

  it("reports a missing count as unknown rather than as zero", () => {
    const body = auditReportBody([gate({ metadata: { dependencies: { total: 572 } } })], RUN);

    expect(body).toContain("Packages audited: unknown production, out of 572 installed.");
  });
});

describe("the alert names what is failing, and only what is failing", () => {
  it("names the one failing gate and calls the passing one passing", () => {
    const body = auditReportBody(
      [
        gate({ surface: "What ships to visitors", exitCode: 1 }),
        gate({ surface: "Everything that runs beside a credential", exitCode: 0 }),
      ],
      RUN,
    );

    expect(body).toContain("**What ships to visitors** is failing, of 2 audited.");
    expect(body).not.toContain("**Everything that runs beside a credential** is failing.");
    expect(body).toContain("## What ships to visitors — failing");
    expect(body).toContain("## Everything that runs beside a credential — passing");
  });

  it("names both when both are failing", () => {
    const body = auditReportBody(
      [
        gate({ surface: "What ships to visitors", exitCode: 1 }),
        gate({ surface: "Everything that runs beside a credential", exitCode: 1 }),
      ],
      RUN,
    );

    expect(body).toContain(
      "**What ships to visitors** and **Everything that runs beside a credential** are failing, of 2 audited.",
    );
  });

  it("says the alert closes itself once nothing is failing", () => {
    const body = auditReportBody([gate({ exitCode: 0 }), gate({ exitCode: 0 })], RUN);

    expect(body).toContain("All 2 audit gates pass again. This alert closes itself.");
  });

  it("never claims a count of gates it did not audit", () => {
    const one = auditReportBody([gate({ exitCode: 0 })], RUN);
    const three = auditReportBody([gate(), gate(), gate()], RUN);

    expect(one).toContain("The audit gate passes again.");
    expect(one).not.toContain("2 audit gates");
    expect(three).toContain("All 3 audit gates pass again.");
  });

  it("carries the audit's own words rather than only a verdict", () => {
    const body = auditReportBody([gate({ output: "sharp  <0.35.4\nSeverity: high" })], RUN);

    expect(body).toContain("sharp  <0.35.4");
    expect(body).toContain("Severity: high");
  });

  it("links the run that produced it", () => {
    expect(auditReportBody([gate()], RUN)).toContain(`(${RUN})`);
  });
});

describe("a verdict is never reached without having looked", () => {
  it("refuses to report on no gates at all", () => {
    expect(() => auditReportBody([], RUN)).toThrow(/without having looked/);
  });

  it("treats any non-zero exit as failing", () => {
    expect(isFailing([gate({ exitCode: 0 })])).toBe(false);
    expect(isFailing([gate({ exitCode: 1 })])).toBe(true);
    expect(isFailing([gate({ exitCode: 0 }), gate({ exitCode: 2 })])).toBe(true);
  });

  it("says an empty audit produced nothing rather than rendering a blank block", () => {
    expect(withinBudget("   \n  ")).toBe("(the audit produced no output)");
  });
});

describe("a long audit is cut down without pretending it was complete", () => {
  it("leaves output within budget exactly as it found it", () => {
    expect(withinBudget("found 0 vulnerabilities")).toBe("found 0 vulnerabilities");
  });

  it("says it truncated once the output runs past the budget", () => {
    const long = "x".repeat(OUTPUT_CHARACTER_BUDGET + 1);

    const kept = withinBudget(long);

    expect(kept).toContain(`truncated at ${OUTPUT_CHARACTER_BUDGET} characters`);
    expect(kept.startsWith("x".repeat(OUTPUT_CHARACTER_BUDGET))).toBe(true);
  });

  it("keeps a body that GitHub will accept even when both gates run long", () => {
    const long = "y".repeat(OUTPUT_CHARACTER_BUDGET * 4);

    const body = auditReportBody([gate({ output: long }), gate({ output: long })], RUN);

    expect(body.length).toBeLessThan(65_536);
  });
});

describe("an exit code that never arrived is never read as success", () => {
  it("reads a real exit code", () => {
    expect(exitCodeFrom("SHIPS", "0")).toBe(0);
    expect(exitCodeFrom("SHIPS", "1")).toBe(1);
  });

  it("refuses an empty string, which Number() would otherwise call zero", () => {
    expect(Number(""), "the trap this guard exists for").toBe(0);
    expect(() => exitCodeFrom("SHIPS", "")).toThrow(/never reached a verdict/);
    expect(() => exitCodeFrom("SHIPS", "   ")).toThrow(/never reached a verdict/);
  });

  it("refuses a variable that was never set", () => {
    expect(() => exitCodeFrom("SHIPS", undefined)).toThrow(/never reached a verdict/);
  });

  it("refuses something that is not an exit code at all", () => {
    expect(() => exitCodeFrom("SHIPS", "yes")).toThrow(/not an exit code/);
    expect(() => exitCodeFrom("SHIPS", "1.5")).toThrow(/not an exit code/);
  });
});
