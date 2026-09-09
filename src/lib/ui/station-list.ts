import type { StationStatus } from "../metrics/queries";
import { slugify } from "../ute/normalize";

export function departmentAnchorId(department: string): string {
  return `departamento-${slugify(department)}`;
}

export interface PipCounts {
  good: number;
  warn: number;
  bad: number;
  total: number;
}

export function pipCounts(
  station: Pick<StationStatus, "operational" | "faulted" | "unknown" | "absent">,
): PipCounts {
  const bad = station.faulted;
  const warn = station.unknown + station.absent;
  const good = station.operational;

  return { good, warn, bad, total: good + warn + bad };
}

function foldAccents(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

export function matchesStationQuery(station: StationStatus, query: string): boolean {
  const trimmed = query.trim();
  if (trimmed.length === 0) return true;

  const haystack = foldAccents(`${station.name} ${station.city ?? ""}`);
  return haystack.includes(foldAccents(trimmed));
}

export interface DepartmentGroup {
  department: string;
  stations: StationStatus[];
  totalInDepartment: number;
}

export function groupByDepartment(
  visible: StationStatus[],
  totals: StationStatus[],
): DepartmentGroup[] {
  const totalsByDepartment = new Map<string, number>();
  for (const station of totals) {
    totalsByDepartment.set(
      station.department,
      (totalsByDepartment.get(station.department) ?? 0) + 1,
    );
  }

  const grouped = new Map<string, StationStatus[]>();
  for (const station of visible) {
    const existing = grouped.get(station.department);
    if (existing) existing.push(station);
    else grouped.set(station.department, [station]);
  }

  return [...grouped]
    .map(([department, stations]): DepartmentGroup => ({
      department,
      stations: [...stations].sort((a, b) => a.name.localeCompare(b.name, "es")),
      totalInDepartment: totalsByDepartment.get(department) ?? stations.length,
    }))
    .sort((a, b) => a.department.localeCompare(b.department, "es"));
}
