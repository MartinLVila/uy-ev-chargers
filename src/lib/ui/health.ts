import type { StationTimelineEntry } from "../metrics/queries";
import { isFreeStatusDetail } from "../ute/status";

export interface HealthPresentation {
  label: string;
  color: string;
  symbol: string;
  pattern: string;
}

const SOLID = "none";
const RISING_STRIPES =
  "repeating-linear-gradient(45deg, transparent 0 3px, var(--stripe) 3px 6px)";
const FALLING_STRIPES =
  "repeating-linear-gradient(-45deg, transparent 0 2px, var(--stripe) 2px 5px)";
const HORIZONTAL_STRIPES =
  "repeating-linear-gradient(0deg, transparent 0 2px, var(--stripe) 2px 4px)";
const VERTICAL_STRIPES =
  "repeating-linear-gradient(90deg, transparent 0 2px, var(--stripe) 2px 4px)";

export type ConnectorUsage = "free" | "inUse" | "broken" | "absent" | "unknown";

export const USAGE_PRESENTATION: Record<ConnectorUsage, HealthPresentation> = {
  free: { label: "Libre", color: "var(--status-good)", symbol: "○", pattern: SOLID },
  inUse: { label: "En uso", color: "var(--state-neutral)", symbol: "●", pattern: RISING_STRIPES },
  broken: {
    label: "Con falla",
    color: "var(--status-critical)",
    symbol: "✕",
    pattern: FALLING_STRIPES,
  },
  absent: {
    label: "Sin reportar",
    color: "var(--status-warning)",
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

export const CONNECTOR_HEALTH: Record<string, HealthPresentation> = {
  operational: { label: "En servicio", color: "var(--status-good)", symbol: "●", pattern: SOLID },
  faulted: {
    label: "Con falla",
    color: "var(--status-critical)",
    symbol: "✕",
    pattern: FALLING_STRIPES,
  },
  absent: {
    label: "Sin reportar",
    color: "var(--status-warning)",
    symbol: "◍",
    pattern: HORIZONTAL_STRIPES,
  },
  unknown: {
    label: "Estado desconocido",
    color: "var(--chart-neutral)",
    symbol: "?",
    pattern: VERTICAL_STRIPES,
  },
};

export const STATION_PRESENCE: Record<string, HealthPresentation> = {
  listed: { label: "En el feed", color: "var(--status-good)", symbol: "●", pattern: SOLID },
  silent: {
    label: "Sin telemetría",
    color: "var(--status-warning)",
    symbol: "?",
    pattern: VERTICAL_STRIPES,
  },
  delisted: {
    label: "Fuera del feed",
    color: "var(--chart-neutral)",
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

export type PaletteToken = "status-good" | "status-warning" | "status-critical" | "chart-neutral";

export interface MarkerPresentation {
  label: string;
  color: string;
  statusToken: PaletteToken;
  symbol: string;
  dashArray: string | undefined;
  radius: number;
}

export const MARKER_PRESENTATION: Record<StationMarkerState, MarkerPresentation> = {
  operational: {
    label: "Todo en servicio",
    color: "#1d8a3f",
    statusToken: "status-good",
    symbol: "●",
    dashArray: undefined,
    radius: 6,
  },
  degraded: {
    label: "Parcial o sin telemetría",
    color: "#b4680c",
    statusToken: "status-warning",
    symbol: "◐",
    dashArray: "6 4",
    radius: 8,
  },
  outOfService: {
    label: "Sin servicio",
    color: "#c8322a",
    statusToken: "status-critical",
    symbol: "✕",
    dashArray: "2 4",
    radius: 8,
  },
  delisted: {
    label: "Fuera del feed",
    color: "#84848a",
    statusToken: "chart-neutral",
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

export interface ConnectorsNow {
  total: number;
  inService: number;
  outOfService: number;
  unknown: number;
}

export function connectorsNow(timeline: StationTimelineEntry[]): ConnectorsNow {
  const open = timeline.filter((entry) => entry.endedAt === null);

  return open.reduce<ConnectorsNow>(
    (running, entry) => {
      const state = connectorUsageState(entry.health, entry.statusDetail);
      const inService = state === "free" || state === "inUse";
      const outOfService = state === "broken" || state === "absent";
      return {
        total: running.total + entry.connectorCount,
        inService: running.inService + (inService ? entry.connectorCount : 0),
        outOfService: running.outOfService + (outOfService ? entry.connectorCount : 0),
        unknown: running.unknown + (inService || outOfService ? 0 : entry.connectorCount),
      };
    },
    { total: 0, inService: 0, outOfService: 0, unknown: 0 },
  );
}
