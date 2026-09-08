import type { StationTimelineEntry } from "../metrics/queries";
import { connectorUsageState } from "./health";

export interface ConnectorTally {
  free: number;
  inUse: number;
  broken: number;
  absent: number;
  unknown: number;
  total: number;
}

export function connectorsNowByUsage(timeline: StationTimelineEntry[]): ConnectorTally {
  const open = timeline.filter((entry) => entry.endedAt === null);

  return open.reduce<ConnectorTally>(
    (running, entry) => {
      const state = connectorUsageState(entry.health, entry.statusDetail);
      return {
        ...running,
        [state]: running[state] + entry.connectorCount,
        total: running.total + entry.connectorCount,
      };
    },
    { free: 0, inUse: 0, broken: 0, absent: 0, unknown: 0, total: 0 },
  );
}

export function availabilityClaim(presence: string, tally: ConnectorTally): string {
  if (presence !== "listed") {
    return "No sabemos si hay lugar ahora: esta estación no está reportando al feed en este momento.";
  }

  if (tally.total === 0) {
    return "No sabemos si hay lugar ahora: no tiene conectores con estado reportado.";
  }

  return tally.free > 0 ? "Ahora hay lugar." : "Ahora no hay lugar libre.";
}
