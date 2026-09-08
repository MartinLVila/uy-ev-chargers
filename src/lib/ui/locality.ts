import type { StationStatus } from "../metrics/queries";
import { UNKNOWN_DEPARTMENT } from "../ute/normalize";

export interface LocalityAggregate {
  name: string;
  department: string;
  latitude: number;
  longitude: number;
  stations: number;
  connectors: number;
  absent: number;
  outOfService: number;
}

const LOCALITY_ALIASES: Record<string, string> = {
  "ciudad de": "ciudad de la costa",
  colonia: "colonia del sacramento",
};

function stripAccents(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function stripDepartmentSuffix(value: string): string {
  return value.replace(/\s+departamento\s+de\s+.*$/i, "");
}

function localityKey(city: string): string {
  const cleaned = stripAccents(stripDepartmentSuffix(city.trim()))
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

  return LOCALITY_ALIASES[cleaned] ?? cleaned;
}

function displayName(candidates: string[]): string {
  const counts = new Map<string, number>();
  for (const candidate of candidates) {
    counts.set(candidate, (counts.get(candidate) ?? 0) + 1);
  }

  return [...counts.entries()].sort(([a, aCount], [b, bCount]) => {
    if (aCount !== bCount) return bCount - aCount;

    const aAccented = a !== stripAccents(a);
    const bAccented = b !== stripAccents(b);
    if (aAccented !== bAccented) return aAccented ? -1 : 1;

    return a.localeCompare(b);
  })[0][0];
}

interface RawGroup {
  key: string;
  department: string;
  stations: StationStatus[];
}

export function aggregateByLocality(stations: StationStatus[]): LocalityAggregate[] {
  const named = stations.filter((station) => station.city && station.city.trim().length > 0);
  const unnamed = stations.filter((station) => !station.city || station.city.trim().length === 0);

  const groups = new Map<string, RawGroup>();
  for (const station of named) {
    const key = localityKey(station.city as string);
    const groupKey = `${key}|${station.department}`;

    const existing = groups.get(groupKey);
    if (existing) {
      existing.stations.push(station);
    } else {
      groups.set(groupKey, { key, department: station.department, stations: [station] });
    }
  }

  const realDepartmentByKey = new Map<string, string>();
  for (const group of groups.values()) {
    if (group.department !== UNKNOWN_DEPARTMENT && !realDepartmentByKey.has(group.key)) {
      realDepartmentByKey.set(group.key, group.department);
    }
  }

  const merged = new Map<string, RawGroup>();
  for (const group of groups.values()) {
    const department =
      group.department === UNKNOWN_DEPARTMENT
        ? (realDepartmentByKey.get(group.key) ?? group.department)
        : group.department;
    const mergedKey = `${group.key}|${department}`;

    const existing = merged.get(mergedKey);
    if (existing) {
      existing.stations.push(...group.stations);
    } else {
      merged.set(mergedKey, { key: group.key, department, stations: [...group.stations] });
    }
  }

  const key = "sin localidad";
  for (const station of unnamed) {
    const mergedKey = `${key}|${station.department}`;
    const existing = merged.get(mergedKey);
    if (existing) {
      existing.stations.push(station);
    } else {
      merged.set(mergedKey, { key, department: station.department, stations: [station] });
    }
  }

  return [...merged.values()]
    .map((group): LocalityAggregate => {
      const { stations: groupStations, department } = group;
      const count = groupStations.length;

      return {
        name:
          group.key === "sin localidad"
            ? "Sin localidad"
            : displayName(groupStations.map((station) => (station.city as string).trim())),
        department,
        latitude: groupStations.reduce((sum, station) => sum + station.latitude, 0) / count,
        longitude: groupStations.reduce((sum, station) => sum + station.longitude, 0) / count,
        stations: count,
        connectors: groupStations.reduce((sum, station) => sum + station.connectors, 0),
        absent: groupStations.reduce((sum, station) => sum + station.absent, 0),
        outOfService: groupStations.reduce((sum, station) => sum + station.outOfService, 0),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}
