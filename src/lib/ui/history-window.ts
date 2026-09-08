import type { DailyPoint } from "../metrics/queries";

const DAY_MS = 24 * 60 * 60 * 1000;

export const HISTORY_CHART_DAYS = 15;

export interface HistorySlot {
  day: string;
  point: DailyPoint | null;
}

export function buildHistoryWindow(
  series: DailyPoint[],
  days: number = HISTORY_CHART_DAYS,
): HistorySlot[] {
  if (series.length === 0) return [];

  const byDay = new Map(series.map((point) => [point.day, point]));
  const end = Date.parse(`${series[series.length - 1].day}T00:00:00Z`);

  return Array.from({ length: days }, (_, index) => {
    const day = new Date(end - (days - 1 - index) * DAY_MS).toISOString().slice(0, 10);
    return { day, point: byDay.get(day) ?? null };
  });
}

export function historyWindowCoverage(slots: HistorySlot[]): number {
  return slots.filter((slot) => slot.point !== null).length;
}
