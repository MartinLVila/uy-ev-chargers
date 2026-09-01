import { isFreeStatusDetail } from "../ute/status";

export interface HealthPresentation {
  label: string;
  color: string;
  symbol: string;
  pattern: string;
}

const SOLID = "none";
const RISING_STRIPES =
  "repeating-linear-gradient(45deg, transparent 0 3px, rgb(255 255 255 / 0.55) 3px 6px)";
const FALLING_STRIPES =
  "repeating-linear-gradient(-45deg, transparent 0 2px, rgb(255 255 255 / 0.6) 2px 5px)";
const HORIZONTAL_STRIPES =
  "repeating-linear-gradient(0deg, transparent 0 2px, rgb(255 255 255 / 0.55) 2px 4px)";
const VERTICAL_STRIPES =
  "repeating-linear-gradient(90deg, transparent 0 2px, rgb(255 255 255 / 0.55) 2px 4px)";

export type ConnectorUsage = "free" | "inUse" | "broken" | "absent" | "unknown";

export const USAGE_PRESENTATION: Record<ConnectorUsage, HealthPresentation> = {
  free: { label: "Libre", color: "var(--status-good)", symbol: "○", pattern: SOLID },
  inUse: { label: "En uso", color: "var(--accent)", symbol: "●", pattern: RISING_STRIPES },
  broken: {
    label: "Con falla",
    color: "var(--status-critical)",
    symbol: "✕",
    pattern: FALLING_STRIPES,
  },
  absent: {
    label: "Sin reportar",
    color: "var(--status-serious)",
    symbol: "◍",
    pattern: HORIZONTAL_STRIPES,
  },
  unknown: {
    label: "Desconocido",
    color: "var(--chart-neutral)",
    symbol: "?",
    pattern: VERTICAL_STRIPES,
  },
};

export function connectorUsageState(health: string, statusDetail: string): ConnectorUsage {
  if (health === "faulted") return "broken";
  if (health === "absent") return "absent";
  if (health === "operational") {
    return isFreeStatusDetail(statusDetail) ? "free" : "inUse";
  }
  return "unknown";
}

export function connectorUsage(health: string, statusDetail: string): HealthPresentation {
  return USAGE_PRESENTATION[connectorUsageState(health, statusDetail)];
}

const CONNECTOR_HEALTH: Record<string, HealthPresentation> = {
  operational: { label: "En servicio", color: "var(--status-good)", symbol: "●", pattern: SOLID },
  faulted: {
    label: "Con falla",
    color: "var(--status-critical)",
    symbol: "✕",
    pattern: FALLING_STRIPES,
  },
  absent: {
    label: "Sin reportar",
    color: "var(--status-serious)",
    symbol: "◍",
    pattern: HORIZONTAL_STRIPES,
  },
  unknown: {
    label: "Estado desconocido",
    color: "var(--status-warning)",
    symbol: "?",
    pattern: VERTICAL_STRIPES,
  },
};

const STATION_PRESENCE: Record<string, HealthPresentation> = {
  listed: { label: "En el feed", color: "var(--status-good)", symbol: "●", pattern: SOLID },
  silent: {
    label: "Sin telemetría",
    color: "var(--status-warning)",
    symbol: "?",
    pattern: VERTICAL_STRIPES,
  },
  delisted: {
    label: "Fuera del feed",
    color: "var(--status-serious)",
    symbol: "◍",
    pattern: HORIZONTAL_STRIPES,
  },
};

const FALLBACK: HealthPresentation = {
  label: "Desconocido",
  color: "var(--text-muted)",
  symbol: "?",
  pattern: VERTICAL_STRIPES,
};

export function connectorHealth(health: string): HealthPresentation {
  return CONNECTOR_HEALTH[health] ?? FALLBACK;
}

export function stationPresence(presence: string): HealthPresentation {
  return STATION_PRESENCE[presence] ?? FALLBACK;
}

export type StationMarkerState = "operational" | "degraded" | "outOfService" | "delisted";

export type StatusToken = "status-good" | "status-warning" | "status-critical" | "status-serious";

export interface MarkerPresentation {
  label: string;
  color: string;
  statusToken: StatusToken;
  symbol: string;
  dashArray: string | undefined;
  radius: number;
}

export const MARKER_PRESENTATION: Record<StationMarkerState, MarkerPresentation> = {
  operational: {
    label: "Todo en servicio",
    color: "#0b9a0b",
    statusToken: "status-good",
    symbol: "●",
    dashArray: undefined,
    radius: 6,
  },
  degraded: {
    label: "Parcial o sin telemetría",
    color: "#b27a04",
    statusToken: "status-warning",
    symbol: "◐",
    dashArray: "6 4",
    radius: 8,
  },
  outOfService: {
    label: "Sin servicio",
    color: "#c62f2f",
    statusToken: "status-critical",
    symbol: "✕",
    dashArray: "2 4",
    radius: 8,
  },
  delisted: {
    label: "Fuera del feed",
    color: "#e5561f",
    statusToken: "status-serious",
    symbol: "◍",
    dashArray: "10 3 2 3",
    radius: 7,
  },
};

export function stationMarkerState(station: {
  presence: string;
  outOfService: number;
  connectors: number;
  absent: number;
}): StationMarkerState {
  if (station.presence === "delisted") return "delisted";
  if (station.presence === "silent") return "degraded";
  if (station.outOfService > 0) {
    const fleet = station.connectors + station.absent;
    return station.outOfService >= fleet ? "outOfService" : "degraded";
  }
  return "operational";
}

export function stationMarker(station: {
  presence: string;
  outOfService: number;
  connectors: number;
  absent: number;
}): MarkerPresentation {
  return MARKER_PRESENTATION[stationMarkerState(station)];
}
