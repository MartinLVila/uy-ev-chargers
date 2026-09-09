import type { ConnectorTallyByUsage } from "./health";
import { haversineKm } from "./distance";
import { UNNAMED_LOCALITY } from "./locality";

export interface LocalityLink {
  name: string;
  department: string;
}

export interface LocalityPosition extends LocalityLink {
  latitude: number;
  longitude: number;
}

export interface RankedLocality extends LocalityPosition {
  distanceKm: number;
}

export interface PositionFix {
  latitude: number;
  longitude: number;
  accuracyMetres: number;
}

export type NearestLocalities =
  | { outcome: "ranked"; localities: RankedLocality[]; marginKm: number | null }
  | { outcome: "fix-too-coarse"; marginKm: number }
  | { outcome: "outside-the-network"; nearestKm: number };

const NEAREST_SHOWN = 5;
const MARGIN_WORTH_SAYING_METRES = 2_000;
const MARGIN_TOO_COARSE_TO_RANK_METRES = 50_000;
const FARTHEST_PLAUSIBLE_KM = 250;

export function localityHref(locality: LocalityLink, extra?: Record<string, string>): string {
  const params = new URLSearchParams({
    localidad: locality.name,
    departamento: locality.department,
    ...extra,
  });

  return `/cerca?${params.toString()}`;
}

export function rankNearestLocalities(
  fix: PositionFix,
  localities: LocalityPosition[],
): NearestLocalities {
  const marginKm = fix.accuracyMetres / 1000;
  if (fix.accuracyMetres > MARGIN_TOO_COARSE_TO_RANK_METRES) {
    return { outcome: "fix-too-coarse", marginKm };
  }

  const ranked = localities
    .filter((locality) => locality.name !== UNNAMED_LOCALITY)
    .map((locality) => ({
      ...locality,
      distanceKm: haversineKm(fix.latitude, fix.longitude, locality.latitude, locality.longitude),
    }))
    .sort((a, b) => a.distanceKm - b.distanceKm);

  const nearest = ranked[0];
  if (!nearest || nearest.distanceKm > FARTHEST_PLAUSIBLE_KM) {
    return { outcome: "outside-the-network", nearestKm: nearest ? nearest.distanceKm : Infinity };
  }

  return {
    outcome: "ranked",
    localities: ranked.slice(0, NEAREST_SHOWN),
    marginKm: fix.accuracyMetres >= MARGIN_WORTH_SAYING_METRES ? marginKm : null,
  };
}

export function availabilityClaim(presence: string, tally: ConnectorTallyByUsage): string {
  if (presence !== "listed") {
    return "No sabemos si hay lugar ahora: esta estación no está reportando al feed en este momento.";
  }

  if (tally.total === 0) {
    return "No sabemos si hay lugar ahora: no tiene conectores con estado reportado.";
  }

  return tally.free > 0 ? "Ahora hay lugar." : "Ahora no hay lugar libre.";
}
