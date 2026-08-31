import type { ConnectorGroupHourlyUsage } from "@/lib/metrics/queries";
import { formatConnectorHours, formatNumber, formatPercent } from "./format";

export const HOURS_IN_DAY = 24;

const SPARSE_COVERAGE_RATIO = 0.25;

export type HourCoverage = "observed" | "sparse" | "unobserved";

export interface UsageHour {
  hour: number;
  coverage: HourCoverage;
  utilization: number | null;
  brokenShare: number | null;
  observedHours: number;
}

export interface ConnectorGroupUsageProfile {
  connectorGroupId: number;
  connectorType: string;
  powerKw: number;
  hasCable: boolean;
  connectorCount: number | null;
  observedDays: number;
  hours: UsageHour[];
  busiest: UsageHour | null;
  quietest: UsageHour | null;
  hoursOutOfService: number;
  hoursThinlyObserved: number;
  hoursWithoutData: number;
}

export function buildUsageProfiles(
  groups: ConnectorGroupHourlyUsage[],
): ConnectorGroupUsageProfile[] {
  return groups
    .map(profileOf)
    .sort((a, b) => a.connectorType.localeCompare(b.connectorType) || b.powerKw - a.powerKw);
}

function profileOf(group: ConnectorGroupHourlyUsage): ConnectorGroupUsageProfile {
  const pointByHour = new Map(group.hours.map((point) => [point.hour, point]));
  const bestObservedHours = group.hours.reduce(
    (best, point) => Math.max(best, point.observedHours),
    0,
  );
  const sparseBelowHours = bestObservedHours * SPARSE_COVERAGE_RATIO;

  const hours: UsageHour[] = Array.from({ length: HOURS_IN_DAY }, (_, hour) => {
    const point = pointByHour.get(hour);
    if (!point || point.observedHours <= 0) {
      return {
        hour,
        coverage: "unobserved",
        utilization: null,
        brokenShare: null,
        observedHours: 0,
      };
    }
    return {
      hour,
      coverage: point.observedHours < sparseBelowHours ? "sparse" : "observed",
      utilization: point.utilization,
      brokenShare: point.brokenShare,
      observedHours: point.observedHours,
    };
  });

  const reliable = hours.filter((entry) => entry.coverage === "observed");

  return {
    connectorGroupId: group.connectorGroupId,
    connectorType: group.connectorType,
    powerKw: group.powerKw,
    hasCable: group.hasCable,
    connectorCount: group.connectorCount,
    observedDays: Math.round(bestObservedHours),
    hours,
    busiest: pickBy(reliable, (candidate, incumbent) => candidate > incumbent),
    quietest: pickBy(reliable, (candidate, incumbent) => candidate < incumbent),
    hoursOutOfService: hours.filter((entry) => (entry.brokenShare ?? 0) > 0).length,
    hoursThinlyObserved: hours.filter((entry) => entry.coverage === "sparse").length,
    hoursWithoutData: hours.filter((entry) => entry.coverage === "unobserved").length,
  };
}

function pickBy(
  hours: UsageHour[],
  beats: (candidate: number, incumbent: number) => boolean,
): UsageHour | null {
  let chosen: UsageHour | null = null;
  for (const entry of hours) {
    if (!chosen || beats(entry.utilization ?? 0, chosen.utilization ?? 0)) chosen = entry;
  }
  return chosen;
}

export function hourLabel(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}

export function hourRangeLabel(hour: number): string {
  return `${hourLabel(hour)}–${hourLabel((hour + 1) % HOURS_IN_DAY)}`;
}

export function usageProfileName(profile: ConnectorGroupUsageProfile): string {
  const cable = profile.hasCable ? "con cable" : "sin cable";
  const group = `${profile.connectorType} de ${profile.powerKw} kW ${cable}`;
  if (profile.connectorCount === null) return group;

  const connectors = profile.connectorCount === 1 ? "conector" : "conectores";
  return `${group}, ${formatNumber(profile.connectorCount)} ${connectors}`;
}

export function formatObservedHours(observedHours: number): string {
  return `${formatConnectorHours(observedHours * 3600)} h observadas`;
}

export function describeUsageProfile(profile: ConnectorGroupUsageProfile): string {
  const sentences = [`Uso por hora de ${usageProfileName(profile)}.`];

  if (profile.busiest && profile.quietest) {
    sentences.push(
      `Más ocupado a las ${hourLabel(profile.busiest.hour)} con ${formatPercent(
        profile.busiest.utilization ?? 0,
      )} de uso, y más libre a las ${hourLabel(profile.quietest.hour)} con ${formatPercent(
        profile.quietest.utilization ?? 0,
      )}.`,
    );
  } else {
    sentences.push("Ninguna hora tiene todavía observación suficiente para señalar un pico.");
  }

  if (profile.observedDays > 0) {
    sentences.push(`Construido sobre unos ${formatNumber(profile.observedDays)} días de observación.`);
  }

  if (profile.hoursThinlyObserved > 0) {
    sentences.push(
      `${profile.hoursThinlyObserved} de las 24 horas se apoyan en pocas observaciones y se marcan aparte.`,
    );
  }

  if (profile.hoursWithoutData > 0) {
    sentences.push(`${profile.hoursWithoutData} de las 24 horas todavía no se observaron.`);
  }

  if (profile.hoursOutOfService > 0) {
    sentences.push(
      `Se registró fuera de servicio en ${profile.hoursOutOfService} de las 24 horas.`,
    );
  }

  return sentences.join(" ");
}

export function describeUsageHour(profile: ConnectorGroupUsageProfile, entry: UsageHour): string {
  if (entry.coverage === "unobserved") {
    return `${hourRangeLabel(entry.hour)}\nSin datos: esta hora nunca se observó.`;
  }

  const observed = formatObservedHours(entry.observedHours);
  const thin = entry.coverage === "sparse" ? " (pocas observaciones)" : "";
  const brokenShare = entry.brokenShare ?? 0;
  const broken =
    brokenShare > 0 ? `\nFuera de servicio ${formatPercent(brokenShare)} del tiempo` : "";

  return `${usageProfileName(profile)}\n${hourRangeLabel(entry.hour)}\nEn uso ${formatPercent(
    entry.utilization ?? 0,
  )} del tiempo en servicio${broken}\n${observed}${thin}`;
}
