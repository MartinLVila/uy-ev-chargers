import { formatPercent } from "./format";
import { HOURS_IN_DAY, hourLabel, type ConnectorGroupUsageProfile, type UsageHour } from "./hourly-usage";

const ENOUGH_OBSERVED_HOURS = 12;
const MOSTLY_OUT_OF_SERVICE = 0.5;
const TOO_FLAT_TO_CALL = 0.15;
const WINDOW_REACHES = 0.25;
const MOST_OF_THE_DAY = 12;

export interface UsageWindow {
  fromHour: number;
  untilHour: number;
  utilization: number;
}

export type UsagePattern =
  | { kind: "out-of-service"; brokenShare: number }
  | { kind: "not-enough-observation"; observedHours: number }
  | { kind: "no-clear-pattern"; typical: number }
  | { kind: "clear"; busy: UsageWindow; free: UsageWindow };

export function usagePattern(profile: ConnectorGroupUsageProfile): UsagePattern {
  const reliable = profile.hours.filter((entry) => entry.coverage === "observed");

  if (reliable.length < ENOUGH_OBSERVED_HOURS) {
    return { kind: "not-enough-observation", observedHours: reliable.length };
  }

  const brokenShare = mean(reliable.map((entry) => entry.brokenShare ?? 0));
  if (brokenShare >= MOSTLY_OUT_OF_SERVICE) return { kind: "out-of-service", brokenShare };

  const utilizations = reliable.map(utilizationOf);
  const peak = Math.max(...utilizations);
  const trough = Math.min(...utilizations);

  if (peak - trough < TOO_FLAT_TO_CALL) {
    return { kind: "no-clear-pattern", typical: mean(utilizations) };
  }

  const reach = (peak - trough) * WINDOW_REACHES;
  const observed = new Map(reliable.map((entry) => [entry.hour, utilizationOf(entry)]));

  return {
    kind: "clear",
    busy: windowAround(observed, peakHour(reliable, (a, b) => a > b), (value) => value >= peak - reach),
    free: windowAround(observed, peakHour(reliable, (a, b) => a < b), (value) => value <= trough + reach),
  };
}

function utilizationOf(entry: UsageHour): number {
  return entry.utilization ?? 0;
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function peakHour(hours: UsageHour[], beats: (candidate: number, incumbent: number) => boolean): number {
  let chosen = hours[0];
  for (const entry of hours) {
    if (beats(utilizationOf(entry), utilizationOf(chosen))) chosen = entry;
  }
  return chosen.hour;
}

function windowAround(
  observed: Map<number, number>,
  centre: number,
  belongs: (utilization: number) => boolean,
): UsageWindow {
  let fromHour = centre;
  let untilHour = centre;
  let span = 1;

  while (span < HOURS_IN_DAY) {
    const before = (fromHour - 1 + HOURS_IN_DAY) % HOURS_IN_DAY;
    const previous = observed.get(before);
    if (previous === undefined || !belongs(previous)) break;
    fromHour = before;
    span += 1;
  }

  while (span < HOURS_IN_DAY) {
    const after = (untilHour + 1) % HOURS_IN_DAY;
    const next = observed.get(after);
    if (next === undefined || !belongs(next)) break;
    untilHour = after;
    span += 1;
  }

  return {
    fromHour,
    untilHour,
    utilization: mean(hoursBetween(observed, fromHour, untilHour)),
  };
}

function hoursBetween(observed: Map<number, number>, fromHour: number, untilHour: number): number[] {
  const values: number[] = [];
  for (let hour = fromHour; ; hour = (hour + 1) % HOURS_IN_DAY) {
    const value = observed.get(hour);
    if (value !== undefined) values.push(value);
    if (hour === untilHour) break;
  }
  return values;
}

export function usageWindowLabel(window: UsageWindow): string {
  return `${hourLabel(window.fromHour)} y las ${hourLabel((window.untilHour + 1) % HOURS_IN_DAY)}`;
}

export function usageWindowSpan(window: UsageWindow): number {
  return ((window.untilHour - window.fromHour + HOURS_IN_DAY) % HOURS_IN_DAY) + 1;
}

export function describeUsagePattern(pattern: UsagePattern): string {
  switch (pattern.kind) {
    case "out-of-service":
      return "Estuvo fuera de servicio la mayor parte del período, así que no tiene sentido hablar de horarios.";
    case "not-enough-observation":
      return "Todavía no se observó lo suficiente como para decir a qué hora conviene venir.";
    case "no-clear-pattern":
      return `No hay una hora mejor que otra: el uso ronda el ${formatPercent(
        pattern.typical,
      )} a lo largo del día.`;
    case "clear":
      return describeWindows(pattern.busy, pattern.free);
  }
}

function describeWindows(busy: UsageWindow, free: UsageWindow): string {
  if (usageWindowSpan(free) > MOST_OF_THE_DAY && usageWindowSpan(busy) <= MOST_OF_THE_DAY) {
    return `Suele estar libre, salvo entre las ${usageWindowLabel(busy)}, cuando llega a ${formatPercent(
      busy.utilization,
    )} de uso.`;
  }

  if (usageWindowSpan(busy) > MOST_OF_THE_DAY && usageWindowSpan(free) <= MOST_OF_THE_DAY) {
    return `Suele estar ocupado, salvo entre las ${usageWindowLabel(free)}, cuando baja a ${formatPercent(
      free.utilization,
    )} de uso.`;
  }

  return `Suele estar más ocupado entre las ${usageWindowLabel(busy)}, con ${formatPercent(
    busy.utilization,
  )} de uso, y más libre entre las ${usageWindowLabel(free)}, con ${formatPercent(
    free.utilization,
  )}.`;
}
