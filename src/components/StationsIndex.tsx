"use client";

import { useMemo, useState } from "react";
import { useMeasuredStickyHeight } from "@/lib/ui/use-measured-sticky-height";
import Link from "next/link";
import type { StationStatus } from "@/lib/metrics/queries";
import { formatNumber } from "@/lib/ui/format";
import {
  departmentAnchorId,
  groupByDepartment,
  matchesStationQuery,
  pipCounts,
} from "@/lib/ui/station-list";

function connectorWording(count: number): string {
  return count === 1 ? "conector" : "conectores";
}

function stationWording(count: number): string {
  return count === 1 ? "estación" : "estaciones";
}

export function StationsIndex({ stations }: { stations: StationStatus[] }) {
  const [query, setQuery] = useState("");
  const [faultsOnly, setFaultsOnly] = useState(false);
  const controls = useMeasuredStickyHeight("--controls-height");

  const visible = useMemo(() => {
    return stations.filter((station) => {
      if (faultsOnly && station.outOfService === 0) return false;
      return matchesStationQuery(station, query);
    });
  }, [stations, query, faultsOnly]);

  const filterIsActive = query.trim().length > 0 || faultsOnly;
  const departments = groupByDepartment(visible, stations);

  return (
    <>
      <div className="stations-controls" ref={controls}>
        <input
          type="search"
          className="stations-search"
          placeholder="Buscar por nombre o localidad"
          aria-label="Buscar por nombre o localidad"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <button
          type="button"
          className="pill-button fault-pill"
          data-active={faultsOnly || undefined}
          aria-pressed={faultsOnly}
          onClick={() => setFaultsOnly((current) => !current)}
        >
          Solo con fallas
        </button>
        <span className="stations-live-count" aria-live="polite">
          {formatNumber(visible.length)} {stationWording(visible.length)} a la vista
        </span>
      </div>

      {departments.map((group) => (
        <section
          key={group.department}
          id={departmentAnchorId(group.department)}
          className="stations-department"
        >
          <h2 className="stations-department-heading">
            {group.department}
            <span className="stations-department-count">
              {filterIsActive
                ? `${formatNumber(group.stations.length)} de ${formatNumber(group.totalInDepartment)} estaciones`
                : `${formatNumber(group.stations.length)} ${stationWording(group.stations.length)}`}
            </span>
          </h2>
          <ul className="hairline-list" role="list">
            {group.stations.map((station) => (
              <StationIndexRow key={station.slug} station={station} />
            ))}
          </ul>
        </section>
      ))}

      {departments.length === 0 && (
        <p className="support-text" style={{ marginTop: 24 }}>
          Ninguna estación coincide con la búsqueda.
        </p>
      )}
    </>
  );
}

function StationIndexRow({ station }: { station: StationStatus }) {
  const pips = pipCounts(station);
  const fleet = station.connectors + station.absent;

  return (
    <li>
      <Link
        href={`/estaciones/${station.slug}`}
        prefetch={false}
        className="station-index-row link-unadorned"
      >
        <span className="station-index-identity">
          <span className="station-row-name">{station.name}</span>
          {station.city && <span className="station-row-city">{station.city}</span>}
        </span>

        <span className="station-pip-strip" aria-hidden="true">
          {Array.from({ length: pips.good }, (_, i) => (
            <span key={`good-${i}`} className="station-pip station-pip-good" />
          ))}
          {Array.from({ length: pips.warn }, (_, i) => (
            <span key={`warn-${i}`} className="station-pip station-pip-warn" />
          ))}
          {Array.from({ length: pips.bad }, (_, i) => (
            <span key={`bad-${i}`} className="station-pip station-pip-bad" />
          ))}
        </span>

        <span className="station-index-meta">
          {formatNumber(fleet)} {connectorWording(fleet)}
        </span>

        <span className="station-index-fault">
          {station.outOfService > 0 ? (
            <>
              <span aria-hidden>✕</span> {formatNumber(station.outOfService)} fuera
            </>
          ) : (
            "—"
          )}
        </span>

        <span className="station-index-arrow" aria-hidden="true">
          →
        </span>
      </Link>
    </li>
  );
}
