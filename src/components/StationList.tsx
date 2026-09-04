import Link from "next/link";
import type { StationStatus } from "@/lib/metrics/queries";
import { formatNumber } from "@/lib/ui/format";
import { stationPresence } from "@/lib/ui/health";

interface StationListProps {
  stations: StationStatus[];
}

function byDepartment(stations: StationStatus[]): [string, StationStatus[]][] {
  const grouped = new Map<string, StationStatus[]>();

  for (const station of stations) {
    const existing = grouped.get(station.department);
    if (existing) existing.push(station);
    else grouped.set(station.department, [station]);
  }

  return [...grouped]
    .map(([department, rows]): [string, StationStatus[]] => [
      department,
      [...rows].sort((a, b) => a.name.localeCompare(b.name, "es")),
    ])
    .sort(([a], [b]) => a.localeCompare(b, "es"));
}

function connectorWording(count: number): string {
  return count === 1 ? "conector" : "conectores";
}

export function StationList({ stations }: StationListProps) {
  if (stations.length === 0) return null;

  const departments = byDepartment(stations);

  return (
    <details style={{ marginTop: 24, fontSize: 14 }}>
      <summary style={{ cursor: "pointer", color: "var(--text-secondary)" }}>
        Ver las {formatNumber(stations.length)} estaciones en una lista
      </summary>

      <p style={{ margin: "12px 0 0", fontSize: 13, color: "var(--text-muted)" }}>
        Toda la red, ordenada por departamento. Los filtros del mapa no la recortan.
      </p>

      {departments.map(([department, rows]) => (
        <section key={department} style={{ marginTop: 28 }}>
          <h3 className="label-caps">
            {department} · {formatNumber(rows.length)}{" "}
            {rows.length === 1 ? "estación" : "estaciones"}
          </h3>
          <ul className="hairline-list" role="list" style={{ marginTop: 10 }}>
            {rows.map((station) => (
              <StationRow key={station.slug} station={station} />
            ))}
          </ul>
        </section>
      ))}
    </details>
  );
}

function StationRow({ station }: { station: StationStatus }) {
  const presence = stationPresence(station.presence);
  const fleet = station.connectors + station.absent;

  return (
    <li className="row-wash station-row">
      <span>
        <Link href={`/estaciones/${station.slug}`} className="station-row-name" prefetch={false}>
          {station.name}
        </Link>
        {station.city && <span className="station-row-city"> · {station.city}</span>}
      </span>

      <span className="station-row-meta">
        {station.presence !== "listed" && (
          <>
            <span>
              <span aria-hidden style={{ color: presence.color }}>
                {presence.symbol}
              </span>{" "}
              {presence.label}
            </span>{" · "}
          </>
        )}
        <span>
          {formatNumber(fleet)} {connectorWording(fleet)}
        </span>
        {station.outOfService > 0 && (
          <>
            {" · "}
            <span className="station-row-broken">
              <span aria-hidden>✕</span> {formatNumber(station.outOfService)} fuera de servicio
            </span>
          </>
        )}
      </span>
    </li>
  );
}
