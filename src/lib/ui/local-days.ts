import { REPORTING_TIME_ZONE } from "../reporting";

const DAY_MS = 24 * 60 * 60 * 1000;
const A_DAY_AND_A_BIT = 26 * 60 * 60 * 1000;

const WALL_CLOCK = new Intl.DateTimeFormat("en-CA", {
  timeZone: REPORTING_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

export interface LocalDay {
  from: number;
  to: number;
  month: number;
  dayOfMonth: number;
}

export function localDays(rangeStart: number, rangeEnd: number): LocalDay[] {
  const days: LocalDay[] = [];
  let from = startOfLocalDay(rangeStart);

  while (from < rangeEnd) {
    const to = startOfLocalDay(from + A_DAY_AND_A_BIT);
    const { month, dayOfMonth } = wallClockOf(Math.max(from, rangeStart));
    days.push({ from, to, month, dayOfMonth });
    from = to;
  }

  return days;
}

export function startOfLocalDay(at: number): number {
  const wallClock = asIfUtc(at);
  const midnight = Math.floor(wallClock / DAY_MS) * DAY_MS;
  const firstGuess = midnight - (asIfUtc(at) - at);
  return midnight - (asIfUtc(firstGuess) - firstGuess);
}

function asIfUtc(at: number): number {
  const { year, month, dayOfMonth, hour, minute, second } = wallClockOf(at);
  return Date.UTC(year, month - 1, dayOfMonth, hour, minute, second);
}

function wallClockOf(at: number): {
  year: number;
  month: number;
  dayOfMonth: number;
  hour: number;
  minute: number;
  second: number;
} {
  const parts = new Map(
    WALL_CLOCK.formatToParts(new Date(at)).map((part) => [part.type, part.value]),
  );

  return {
    year: Number(parts.get("year")),
    month: Number(parts.get("month")),
    dayOfMonth: Number(parts.get("day")),
    hour: Number(parts.get("hour")) % 24,
    minute: Number(parts.get("minute")),
    second: Number(parts.get("second")),
  };
}
