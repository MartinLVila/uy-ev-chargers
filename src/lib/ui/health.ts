export interface HealthPresentation {
  label: string;
  color: string;
  symbol: string;
}

const CONNECTOR_HEALTH: Record<string, HealthPresentation> = {
  operational: { label: "En servicio", color: "var(--status-good)", symbol: "●" },
  faulted: { label: "Con falla", color: "var(--status-critical)", symbol: "✕" },
  absent: { label: "Sin reportar", color: "var(--status-serious)", symbol: "◍" },
  unknown: { label: "Estado desconocido", color: "var(--status-warning)", symbol: "?" },
};

const STATION_PRESENCE: Record<string, HealthPresentation> = {
  listed: { label: "En el feed", color: "var(--status-good)", symbol: "●" },
  silent: { label: "Sin telemetría", color: "var(--status-warning)", symbol: "?" },
  delisted: { label: "Fuera del feed", color: "var(--status-serious)", symbol: "◍" },
};

const FALLBACK: HealthPresentation = {
  label: "Desconocido",
  color: "var(--text-muted)",
  symbol: "?",
};

export function connectorHealth(health: string): HealthPresentation {
  return CONNECTOR_HEALTH[health] ?? FALLBACK;
}

export function stationPresence(presence: string): HealthPresentation {
  return STATION_PRESENCE[presence] ?? FALLBACK;
}

export function stationMarkerColor(station: {
  presence: string;
  outOfService: number;
  connectors: number;
  absent: number;
}): string {
  if (station.presence === "delisted") return "#ec835a";
  if (station.presence === "silent") return "#fab219";
  if (station.outOfService > 0) {
    const fleet = station.connectors + station.absent;
    return station.outOfService >= fleet ? "#d03b3b" : "#fab219";
  }
  return "#0ca30c";
}
