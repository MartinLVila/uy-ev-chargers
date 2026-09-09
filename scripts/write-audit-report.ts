import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import {
  auditReportBody,
  exitCodeFrom,
  isFailing,
  type AuditedGate,
  type AuditedSubset,
  type AuditMetadata,
} from "./audit-report";

function metadataOf(file: string): AuditMetadata | null {
  if (!existsSync(file)) {
    console.error(`${file} was never written, so its counts are unknown`);
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
    const metadata = (parsed as { metadata?: unknown } | null)?.metadata;
    if (typeof metadata !== "object" || metadata === null) {
      console.error(`${file} carries no metadata block, so its counts are unknown`);
      return null;
    }
    return metadata as AuditMetadata;
  } catch (error) {
    console.error(`${file} could not be parsed, so its counts are unknown`, error);
    return null;
  }
}

function outputOf(file: string): string {
  if (!existsSync(file)) {
    console.error(`${file} was never written, so the audit's own words are missing`);
    return "";
  }
  return readFileSync(file, "utf8");
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is unset, so the report would be published incomplete`);
  return value;
}

function gate(
  surface: string,
  command: string,
  audits: AuditedSubset,
  slug: string,
  exitCodeVariable: string,
): AuditedGate {
  return {
    surface,
    command,
    audits,
    exitCode: exitCodeFrom(exitCodeVariable, process.env[exitCodeVariable]),
    output: outputOf(`audit-output/${slug}.txt`),
    metadata: metadataOf(`audit-output/${slug}.json`),
  };
}

const gates = [
  gate(
    "What ships to visitors",
    "npm audit --omit=dev --audit-level=moderate",
    "production only",
    "ships",
    "SHIPS",
  ),
  gate(
    "Everything that runs beside a credential",
    "npm audit --audit-level=high",
    "the whole installed tree",
    "everything",
    "EVERYTHING",
  ),
];

const body = auditReportBody(gates, required("RUN_URL"));

writeFileSync("audit-output/report.md", body);
appendFileSync(required("GITHUB_OUTPUT"), `failing=${isFailing(gates) ? "yes" : "no"}\n`);

console.log(body);
