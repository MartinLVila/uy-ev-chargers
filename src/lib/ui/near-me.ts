import type { ConnectorTallyByUsage } from "./health";

export function availabilityClaim(presence: string, tally: ConnectorTallyByUsage): string {
  if (presence !== "listed") {
    return "No sabemos si hay lugar ahora: esta estación no está reportando al feed en este momento.";
  }

  if (tally.total === 0) {
    return "No sabemos si hay lugar ahora: no tiene conectores con estado reportado.";
  }

  return tally.free > 0 ? "Ahora hay lugar." : "Ahora no hay lugar libre.";
}
