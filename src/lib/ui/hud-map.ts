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
  stationDepartments: string[];
  x: number;
  y: number;
  radius: number;
  fleet: number;
  outOfService: number;
  observed: boolean;
}

export interface CorridorPath {
  id: string;
  name: string;
  d: string;
  x: number;
  y: number;
}

interface Corridor {
  id: string;
  name: string;
  coordinates: [number, number][];
}

const CORRIDORS: Corridor[] = [
  {
    id: "ruta-1-9",
    name: "Ruta 1 / Ruta 9 · Montevideo–Chuy",
    coordinates: [
      [-56.16, -34.9],
      [-55.76, -34.77],
      [-55.28, -34.87],
      [-54.95, -34.96],
      [-54.33, -34.48],
      [-54.17, -34.66],
      [-53.46, -33.69],
    ],
  },
  {
    id: "ruta-1-litoral",
    name: "Ruta 1 · Montevideo–Colonia",
    coordinates: [
      [-56.16, -34.9],
      [-56.71, -34.34],
      [-57.09, -34.36],
      [-57.85, -34.47],
      [-58.28, -34.0],
    ],
  },
  {
    id: "ruta-5",
    name: "Ruta 5 · Montevideo–Rivera",
    coordinates: [
      [-56.16, -34.9],
      [-56.21, -34.1],
      [-56.52, -33.38],
      [-56.51, -32.81],
      [-55.98, -31.72],
      [-55.55, -30.9],
    ],
  },
  {
    id: "litoral-norte",
    name: "Litoral norte · Durazno–Salto",
    coordinates: [
      [-56.52, -33.38],
      [-57.63, -32.7],
      [-58.08, -32.32],
      [-57.96, -31.39],
      [-57.6, -30.26],
    ],
  },
  {
    id: "ruta-8",
    name: "Ruta 8 · Montevideo–Melo",
    coordinates: [
      [-56.16, -34.9],
      [-55.24, -34.37],
      [-54.38, -33.23],
      [-54.18, -32.37],
    ],
  },
];

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

export function buildCorridorPaths(projection: GeoProjection): CorridorPath[] {
  const path = geoPath(projection);

  return CORRIDORS.map((corridor) => {
    const mid = corridor.coordinates[Math.floor(corridor.coordinates.length / 2)];
    const projected = projection(mid);
    return {
      id: corridor.id,
      name: corridor.name,
      d: path({ type: "LineString", coordinates: corridor.coordinates }) ?? "",
      x: projected?.[0] ?? 0,
      y: projected?.[1] ?? 0,
    };
  }).filter((corridor) => corridor.d !== "");
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
      if (!projected || !Number.isFinite(projected[0]) || !Number.isFinite(projected[1])) return null;

      const fleet = locality.connectors + locality.absent;

      return {
        name: locality.name,
        department: locality.department,
        stationDepartments: [...new Set(locality.memberStations.map((station) => station.department))],
        x: projected[0],
        y: projected[1],
        radius: localityRadius(fleet),
        fleet,
        outOfService: locality.outOfService,
        observed: fleet > 0,
      };
    })
    .filter((point): point is LocalityPoint => point !== null);
}

export function localityTooltip(point: Pick<LocalityPoint, "name" | "fleet" | "outOfService" | "observed">): string {
  if (!point.observed) return `${point.name}: sin datos recientes.`;
  if (point.outOfService === 0) return `${point.name}: ${point.fleet} conectores, todos en servicio.`;
  return `${point.name}: ${point.fleet} conectores, ${point.outOfService} fuera de servicio.`;
}

export type LocalityState = "good" | "bad" | "unknown";

export function localityState(
  point: Pick<LocalityPoint, "observed" | "outOfService">,
): LocalityState {
  if (!point.observed) return "unknown";
  return point.outOfService > 0 ? "bad" : "good";
}
