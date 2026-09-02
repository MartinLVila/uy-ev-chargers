import { formatPercent } from "./format";
import { HOURS_IN_DAY, hourLabel, type ConnectorGroupUsageProfile, type UsageHour } from "./hourly-usage";

const ENOUGH_OBSERVED_HOURS = 20;
const ENOUGH_OBSERVED_DAYS = 7;
const HOUR_TOO_BROKEN_TO_JUDGE = 0.25;
const TOO_FLAT_TO_CALL = 0.15;
const WINDOW_REACHES = 0.25;
const MOST_OF_THE_DAY = 12;

export interface UsageWindow {
  fromHour: number;
  untilHour: number;
  utilization: number;
}

interface RunWindow extends UsageWindow {
  hours: number;
}

export type UsagePattern =
  | { kind: "out-of-service"; brokenShare: number }
  | { kind: "not-enough-observation"; observedHours: number }
  | { kind: "no-clear-pattern"; typical: number }
  | { kind: "clear"; busy: UsageWindow; free: UsageWindow };

export function usagePattern(profile: ConnectorGroupUsageProfile): UsagePattern {
  const observed = profile.hours.filter((entry) => entry.coverage === "observed");

  if (observed.length < ENOUGH_OBSERVED_HOURS || profile.observedDays < ENOUGH_OBSERVED_DAYS) {
    return { kind: "not-enough-observation", observedHours: observed.length };
  }

  const usable = observed.filter((entry) => brokenShareOf(entry) < HOUR_TOO_BROKEN_TO_JUDGE);
  if (usable.length * 2 <= observed.length) {
    return { kind: "out-of-service", brokenShare: mean(observed.map(brokenShareOf)) };
  }

  const utilizations = usable.map(utilizationOf);
  const peak = Math.max(...utilizations);
  const trough = Math.min(...utilizations);

  if (peak - trough < TOO_FLAT_TO_CALL) {
    return { kind: "no-clear-pattern", typical: mean(utilizations) };
  }

  const reach = (peak - trough) * WINDOW_REACHES;

  return {
    kind: "clear",
    busy: longestRun(usable, (value) => value >= peak - reach, (a, b) => a > b),
    free: longestRun(usable, (value) => value <= trough + reach, (a, b) => a < b),
  };
}

function utilizationOf(entry: UsageHour): number {
  return entry.utilization ?? 0;
}

function brokenShareOf(entry: UsageHour): number {
  return entry.brokenShare ?? 0;
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function longestRun(
  usable: UsageHour[],
  belongs: (utilization: number) => boolean,
  beats: (candidate: number, incumbent: number) => boolean,
): UsageWindow {
  const qualifying = new Map(
    usable
      .filter((entry) => belongs(utilizationOf(entry)))
      .map((entry) => [entry.hour, utilizationOf(entry)] as const),
  );

  let best: RunWindow | null = null;
  for (const run of runsIn(qualifying)) {
    if (!best || run.hours > best.hours) best = run;
    else if (run.hours === best.hours && beats(run.utilization, best.utilization)) best = run;
  }

  return best ?? { fromHour: 0, untilHour: HOURS_IN_DAY - 1, utilization: 0 };
}

function runsIn(qualifying: Map<number, number>): RunWindow[] {
  const runs: RunWindow[] = [];
  let current: number[] = [];

  const close = () => {
    if (current.length === 0) return;
    runs.push(runOf(current, qualifying));
    current = [];
  };

  for (let hour = 0; hour < HOURS_IN_DAY; hour += 1) {
    if (qualifying.has(hour)) current.push(hour);
    else close();
  }
  close();

  return joinAcrossMidnight(runs, qualifying);
}

function runOf(hours: number[], qualifying: Map<number, number>): RunWindow {
  return {
    fromHour: hours[0],
    untilHour: hours[hours.length - 1],
    hours: hours.length,
    utilization: mean(hours.map((hour) => qualifying.get(hour) ?? 0)),
  };
}

function joinAcrossMidnight(runs: RunWindow[], qualifying: Map<number, number>): RunWindow[] {
  const first = runs[0];
  const last = runs[runs.length - 1];
  if (runs.length < 2 || first.fromHour !== 0 || last.untilHour !== HOURS_IN_DAY - 1) return runs;

  const joined = runOf(
    [...hoursOf(last.fromHour, last.untilHour), ...hoursOf(first.fromHour, first.untilHour)],
    qualifying,
  );

  return [{ ...joined, fromHour: last.fromHour, untilHour: first.untilHour }, ...runs.slice(1, -1)];
}

function hoursOf(fromHour: number, untilHour: number): number[] {
  const hours: number[] = [];
  for (let hour = fromHour; ; hour = (hour + 1) % HOURS_IN_DAY) {
    hours.push(hour);
    if (hour === untilHour) break;
  }
  return hours;
}

export function usageWindowLabel(window: UsageWindow): string {
  return `${hourLabel(window.fromHour)} y las ${hourLabel((window.untilHour + 1) % HOURS_IN_DAY)}`;
}

export function usageWindowSpan(window: UsageWindow): number {
  return ((window.untilHour - window.fromHour + HOURS_IN_DAY) % HOURS_IN_DAY) + 1;
}

export function makesAClaimAboutUsage(pattern: UsagePattern): boolean {
  return pattern.kind !== "not-enough-observation";
}

export function describeUsagePattern(pattern: UsagePattern): string {
  switch (pattern.kind) {
    case "out-of-service":
      return "Estuvo fuera de servicio buena parte del período, así que no tiene sentido hablar de horarios.";
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
