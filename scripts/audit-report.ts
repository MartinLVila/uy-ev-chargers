const SEVERITIES = ["critical", "high", "moderate", "low", "info"] as const;

type Severity = (typeof SEVERITIES)[number];

export type AuditedSubset = "production only" | "the whole installed tree";

export interface AuditMetadata {
  vulnerabilities?: Partial<Record<Severity | "total", number>>;
  dependencies?: Partial<Record<"prod" | "dev" | "total", number>>;
}

export interface AuditedGate {
  surface: string;
  command: string;
  audits: AuditedSubset;
  exitCode: number;
  output: string;
  metadata: AuditMetadata | null;
}

export const OUTPUT_CHARACTER_BUDGET = 20_000;

export function exitCodeFrom(name: string, raw: string | undefined): number {
  if (raw === undefined || raw.trim() === "") {
    throw new Error(`${name} arrived empty, so that gate never reached a verdict to report`);
  }

  const parsed = Number(raw);
  if (!Number.isInteger(parsed)) {
    throw new Error(`${name} is ${JSON.stringify(raw)}, which is not an exit code`);
  }

  return parsed;
}

export function isFailing(gates: AuditedGate[]): boolean {
  return gates.some((gate) => gate.exitCode !== 0);
}

export function withinBudget(output: string): string {
  const trimmed = output.trim();
  if (trimmed.length === 0) return "(the audit produced no output)";
  if (trimmed.length <= OUTPUT_CHARACTER_BUDGET) return trimmed;

  return `${trimmed.slice(0, OUTPUT_CHARACTER_BUDGET)}\n… truncated at ${OUTPUT_CHARACTER_BUDGET} characters.`;
}

function stated(value: number | undefined): string {
  return typeof value === "number" ? String(value) : "unknown";
}

function fenced(output: string): string {
  return ["````", output, "````"].join("\n");
}

function severityLine(metadata: AuditMetadata | null): string {
  if (!metadata?.vulnerabilities) return "Severity counts are unknown: the audit produced no JSON.";

  const counted = SEVERITIES.map(
    (severity) => `${stated(metadata.vulnerabilities?.[severity])} ${severity}`,
  );
  return `Severity on this surface: ${counted.join(", ")}.`;
}

function scopeLine(gate: AuditedGate): string {
  const dependencies = gate.metadata?.dependencies;
  if (!dependencies) return "The size of the audited tree is unknown: the audit produced no JSON.";

  if (gate.audits === "production only") {
    return `Packages audited: ${stated(dependencies.prod)} production, out of ${stated(dependencies.total)} installed.`;
  }

  return `Packages audited: ${stated(dependencies.total)} installed — ${stated(dependencies.prod)} production and ${stated(dependencies.dev)} development.`;
}

function sectionFor(gate: AuditedGate): string {
  return [
    `## ${gate.surface} — ${gate.exitCode === 0 ? "passing" : "failing"}`,
    "",
    `\`${gate.command}\` exited ${gate.exitCode}.`,
    "",
    scopeLine(gate),
    "",
    severityLine(gate.metadata),
    "",
    fenced(withinBudget(gate.output)),
  ].join("\n");
}

function verdictFor(gates: AuditedGate[]): string {
  const failing = gates.filter((gate) => gate.exitCode !== 0);
  if (failing.length === 0) {
    const passing =
      gates.length === 1 ? "The audit gate passes" : `All ${gates.length} audit gates pass`;
    return `${passing} again. This alert closes itself.`;
  }

  const named = failing.map((gate) => `**${gate.surface}**`).join(" and ");
  return `${named} ${failing.length === 1 ? "is" : "are"} failing, of ${gates.length} audited. Nothing needs to have been pushed for this to change: \`npm audit\` reads a database that moves on its own, so the tree can be identical and the answer different.`;
}

export function auditReportBody(gates: AuditedGate[], runUrl: string): string {
  if (gates.length === 0) {
    throw new Error("a report over no gates would say nothing was wrong without having looked");
  }

  return [
    verdictFor(gates),
    "",
    ...gates.flatMap((gate) => [sectionFor(gate), ""]),
    `[The scheduled run that produced this](${runUrl})`,
    "",
    "Opened, updated and closed by the daily dependency audit. Editing it by hand will be overwritten on the next run.",
  ].join("\n");
}
