import type { DailyPoint } from "../metrics/queries";
import { formatNumber } from "./format";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface ObservedRange {
  start: number;
  end: number;
}

export function daysOfHistory(
  history: DailyPoint[],
  requestedDays: number,
  now: number = Date.now(),
): number {
  const opened = now - requestedDays * DAY_MS;
  const inWindow = history.filter((point) => {
    const closed = Date.parse(`${point.day}T23:59:59Z`);
    return Number.isFinite(closed) && closed >= opened;
  });

  return Math.min(inWindow.length, requestedDays);
}

export function daysOfRange(range: ObservedRange | null, requestedDays: number): number {
  if (!range || !Number.isFinite(range.start) || !Number.isFinite(range.end)) return 0;
  if (range.end <= range.start) return 0;

  return Math.min(Math.max(1, Math.round((range.end - range.start) / DAY_MS)), requestedDays);
}

export function observedSince(firstSeenAt: string, window: { from: Date; to: Date }): ObservedRange {
  const firstSeen = Date.parse(firstSeenAt);
  if (!Number.isFinite(firstSeen)) return { start: window.to.getTime(), end: window.to.getTime() };

  return { start: Math.max(window.from.getTime(), firstSeen), end: window.to.getTime() };
}

export function lastDaysHeading(days: number): string {
  if (days <= 0) return "Todavía sin historial";
  if (days === 1) return "El último día";
  return `Los últimos ${formatNumber(days)} días`;
}

export function lastDaysSentence(days: number): string {
  if (days <= 0) return "Todavía sin historial";
  if (days === 1) return "Último día";
  return `Últimos ${formatNumber(days)} días`;
}

export function lastDaysPhrase(days: number): string {
  if (days <= 0) return "el período que se muestra";
  if (days === 1) return "el último día";
  return `los últimos ${formatNumber(days)} días`;
}

export function observedSpan(days: number): string {
  if (days <= 0) return "el tiempo que llevamos observando esta estación";
  if (days === 1) return "el último día";
  return `los últimos ${formatNumber(days)} días que llevamos observando esta estación`;
}
