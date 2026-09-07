import { geoMercator, geoPath, type GeoProjection } from "d3-geo";
import { feature } from "topojson-client";
import type { Topology } from "topojson-specification";
import type { LocalityAggregate } from "./locality";

export const VIEW_WIDTH = 1280;
export const VIEW_HEIGHT = 620;

const INSET_X = 0.08;
const INSET_Y = 0.06;

const COUNTRIES: Record<string, string> = {
  "858": "Uruguay",
  "032": "Argentina",
  "076": "Brasil",
};

export interface CountryPath {
  id: string;
  name: string;
  d: string;
  isUruguay: boolean;
}

export interface LocalityPoint {
  name: string;
  department: string;
  x: number;
  y: number;
  radius: number;
  connectors: number;
  outOfService: number;
  observed: boolean;
}

function buildProjection(topology: Topology): GeoProjection {
  const uruguay = feature(topology, "858");

  return geoMercator().fitExtent(
    [
      [VIEW_WIDTH * INSET_X, VIEW_HEIGHT * INSET_Y],
      [VIEW_WIDTH * (1 - INSET_X), VIEW_HEIGHT * (1 - INSET_Y)],
    ],
    uruguay,
  );
}

export function buildCountryPaths(topology: Topology): { paths: CountryPath[]; projection: GeoProjection } {
  const projection = buildProjection(topology);
  const path = geoPath(projection);

  const paths = Object.entries(COUNTRIES).map(([id, name]) => {
    const geo = feature(topology, id);
    return {
      id,
      name,
      d: path(geo) ?? "",
      isUruguay: id === "858",
    };
  });

  return { paths, projection };
}

export function localityRadius(connectors: number): number {
  return 3.2 + Math.sqrt(Math.max(0, connectors)) * 1.45;
}

export function buildLocalityPoints(
  localities: LocalityAggregate[],
  projection: GeoProjection,
): LocalityPoint[] {
  return localities
    .map((locality): LocalityPoint | null => {
      const projected = projection([locality.longitude, locality.latitude]);
      if (!projected) return null;

      return {
        name: locality.name,
        department: locality.department,
        x: projected[0],
        y: projected[1],
        radius: localityRadius(locality.connectors),
        connectors: locality.connectors,
        outOfService: locality.outOfService,
        observed: locality.connectors > 0,
      };
    })
    .filter((point): point is LocalityPoint => point !== null);
}

export function localityTooltip(point: Pick<LocalityPoint, "name" | "connectors" | "outOfService" | "observed">): string {
  if (!point.observed) return `${point.name}: sin datos recientes.`;
  if (point.outOfService === 0) return `${point.name}: ${point.connectors} conectores, todos en servicio.`;
  return `${point.name}: ${point.connectors} conectores, ${point.outOfService} fuera de servicio.`;
}

export type LocalityState = "good" | "bad" | "unknown";

export function localityState(
  point: Pick<LocalityPoint, "observed" | "outOfService">,
): LocalityState {
  if (!point.observed) return "unknown";
  return point.outOfService > 0 ? "bad" : "good";
}
