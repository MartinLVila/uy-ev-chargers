export interface TimeWindow {
  from: Date;
  to: Date;
}

export const DEFAULT_WINDOW_DAYS = 30;
export const MAX_WINDOW_DAYS = 730;

const DAY_MS = 24 * 60 * 60 * 1000;

export function windowFromDays(days: number, now: Date = new Date()): TimeWindow {
  const clamped = Math.min(Math.max(Math.trunc(days), 1), MAX_WINDOW_DAYS);
  return { from: new Date(now.getTime() - clamped * DAY_MS), to: now };
}

export function parseWindowDays(value: string | null | undefined): number {
  if (!value) return DEFAULT_WINDOW_DAYS;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_WINDOW_DAYS;
  return Math.min(parsed, MAX_WINDOW_DAYS);
}
