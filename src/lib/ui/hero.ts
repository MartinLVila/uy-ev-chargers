import { formatNumber } from "./format";

const RING_CIRCUMFERENCE = 534;

export function outOfServiceRatio(outOfService: number, fleet: number): number {
  return fleet > 0 ? outOfService / fleet : 0;
}

export function mostRecentPollFailed(
  lastSuccessfulPollAt: string | null,
  lastFailureAt: string | null,
): boolean {
  if (!lastFailureAt) return false;
  if (!lastSuccessfulPollAt) return true;

  return lastFailureAt > lastSuccessfulPollAt;
}

export function outOfServiceSentence(outOfService: number, fleet: number): string | null {
  if (fleet <= 0) return null;

  const ratio = outOfServiceRatio(outOfService, fleet);
  if (ratio <= 0) return "Ninguno está fuera de servicio en este momento.";
  if (ratio >= 1) return "Todos los enchufes de la red están fuera de servicio en este momento.";

  const n = Math.round(1 / ratio);
  if (n < 2) {
    return "Más de uno de cada dos enchufes de la red no puede cargar un auto en este momento.";
  }

  return `Uno de cada ${formatNumber(n)} enchufes de la red no puede cargar un auto en este momento.`;
}

export interface RingGeometry {
  circumference: number;
  offset: number;
  share: number;
}

export function heroRingGeometry(inService: number, fleet: number): RingGeometry | null {
  if (fleet <= 0) return null;

  const share = Math.min(1, Math.max(0, inService / fleet));
  return {
    circumference: RING_CIRCUMFERENCE,
    offset: RING_CIRCUMFERENCE * (1 - share),
    share,
  };
}
