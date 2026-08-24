const NUMBER = new Intl.NumberFormat("es-UY");
const PERCENT = new Intl.NumberFormat("es-UY", {
  style: "percent",
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const DATE_TIME = new Intl.DateTimeFormat("es-UY", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/Montevideo",
});
const DATE = new Intl.DateTimeFormat("es-UY", {
  day: "2-digit",
  month: "short",
  timeZone: "America/Montevideo",
});

export function formatNumber(value: number): string {
  return NUMBER.format(value);
}

export function formatPercent(ratio: number): string {
  return PERCENT.format(ratio);
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return "sin datos";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "sin datos" : DATE_TIME.format(date);
}

export function formatDay(day: string): string {
  const date = new Date(`${day}T12:00:00Z`);
  return Number.isNaN(date.getTime()) ? day : DATE.format(date);
}

export function formatElapsed(iso: string | null): string {
  if (!iso) return "sin datos";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "sin datos";

  const minutes = Math.max(0, Math.round((Date.now() - then) / 60_000));
  if (minutes < 1) return "recién";
  if (minutes < 60) return `hace ${minutes} min`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;

  const days = Math.round(hours / 24);
  return `hace ${days} d`;
}

export function formatConnectorHours(connectorSeconds: number): string {
  if (connectorSeconds <= 0) return "0";
  const hours = connectorSeconds / 3600;
  if (hours < 1) return "<1";
  if (hours < 100) return hours.toFixed(1);
  return NUMBER.format(Math.round(hours));
}
