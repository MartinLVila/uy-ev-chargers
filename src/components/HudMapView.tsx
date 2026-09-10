"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { formatNumber } from "@/lib/ui/format";
import { departmentAnchorId } from "@/lib/ui/station-list";
import {
  hitRadius,
  localityState,
  localityTooltip,
  tooltipSitsBelow,
  VIEW_HEIGHT,
  VIEW_WIDTH,
  type CorridorPath,
  type CountryPath,
  type LocalityPoint,
} from "@/lib/ui/hud-map";

function departmentHref(point: LocalityPoint): string {
  if (point.stationDepartments.length !== 1) return "/estaciones";
  return `/estaciones#${departmentAnchorId(point.stationDepartments[0])}`;
}

export function HudMapView({
  paths,
  points,
  corridors,
}: {
  paths: CountryPath[];
  points: LocalityPoint[];
  corridors: CorridorPath[];
}) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [activeCorridor, setActiveCorridor] = useState<CorridorPath | null>(null);
  const tooltipId = useId();
  const active = activeIndex !== null ? points[activeIndex] : null;

  return (
    <div>
      <p className="visually-hidden">
        Mapa de la red de carga: {formatNumber(points.length)} localidades, cada una como un
        círculo. Cada círculo es alcanzable con el tabulador y describe su propio estado; abajo
        hay la misma información en una lista.
      </p>

      <div className="hud-map-canvas">
        <svg className="hud-map-svg" viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}>
          <rect className="hud-map-ground" x={0} y={0} width={VIEW_WIDTH} height={VIEW_HEIGHT} aria-hidden="true" />

          <g className="hud-scan-clip">
            <clipPath id={`${tooltipId}-scan-clip`}>
              <rect x={0} y={0} width={VIEW_WIDTH} height={VIEW_HEIGHT} />
            </clipPath>
            <g clipPath={`url(#${tooltipId}-scan-clip)`} aria-hidden="true">
              <rect className="hud-scan-line" x={0} width={VIEW_WIDTH} height={2} />
            </g>
          </g>

          {paths.map((country) => (
            <path
              key={country.id}
              d={country.d}
              className={country.isUruguay ? "hud-country hud-country-uruguay" : "hud-country hud-country-neighbor"}
              aria-hidden="true"
            />
          ))}

          <g className="hud-corridors" aria-hidden="true">
            {corridors.map((corridor) => (
              <g
                key={corridor.id}
                onMouseEnter={() => setActiveCorridor(corridor)}
                onMouseLeave={() =>
                  setActiveCorridor((current) => (current?.id === corridor.id ? null : current))
                }
              >
                <path d={corridor.d} className="hud-corridor-glow" />
                <path d={corridor.d} className="hud-corridor-flow" />
                <path d={corridor.d} className="hud-corridor-hit" />
              </g>
            ))}
          </g>

          {points.map((point, index) => {
            const state = localityState(point);
            const href = departmentHref(point);
            return (
              <g key={`${point.name}-${point.department}`}>
                {state === "bad" && (
                  <circle
                    className="hud-locality-halo"
                    cx={point.x}
                    cy={point.y}
                    r={point.radius + 6}
                    aria-hidden="true"
                  />
                )}
                <a
                  href={href}
                  className="hud-locality-link"
                  aria-label={`${localityTooltip(point)} Ver las estaciones de ${point.department}.`}
                  aria-describedby={activeIndex === index ? tooltipId : undefined}
                  onMouseEnter={() => setActiveIndex(index)}
                  onMouseLeave={() => setActiveIndex((current) => (current === index ? null : current))}
                  onFocus={() => setActiveIndex(index)}
                  onBlur={() => setActiveIndex((current) => (current === index ? null : current))}
                >
                  <circle
                    className={`hud-locality hud-locality-${state}`}
                    data-active={activeIndex === index || undefined}
                    cx={point.x}
                    cy={point.y}
                    r={point.radius}
                  />
                  <circle
                    className="hud-locality-hit"
                    cx={point.x}
                    cy={point.y}
                    r={hitRadius(point, points)}
                  />
                </a>
              </g>
            );
          })}
        </svg>

        {active && (
          <div
            id={tooltipId}
            role="tooltip"
            className="hud-tooltip"
            data-below={tooltipSitsBelow(active.y) || undefined}
            style={{
              left: `${(active.x / VIEW_WIDTH) * 100}%`,
              top: `${(active.y / VIEW_HEIGHT) * 100}%`,
            }}
          >
            <strong>{active.name}</strong>
            <span>{localityTooltip(active)}</span>
          </div>
        )}

        {activeCorridor && (
          <div
            role="tooltip"
            className="hud-tooltip"
            data-below={tooltipSitsBelow(activeCorridor.y) || undefined}
            style={{
              left: `${(activeCorridor.x / VIEW_WIDTH) * 100}%`,
              top: `${(activeCorridor.y / VIEW_HEIGHT) * 100}%`,
            }}
          >
            <strong>{activeCorridor.name}</strong>
          </div>
        )}
      </div>

      <details className="hud-map-fallback">
        <summary>Ver las {formatNumber(points.length)} localidades en una lista</summary>
        <ul role="list" className="hairline-list" style={{ marginTop: 10 }}>
          {points.map((point) => (
            <li key={`${point.name}-${point.department}`} className="row-wash station-row">
              <Link href={departmentHref(point)} className="link-unadorned">
                <span className="station-row-name">{point.name}</span>
                <span className="station-row-city"> · {point.department}</span>
              </Link>
              <span className="station-row-meta">{localityTooltip(point)}</span>
            </li>
          ))}
        </ul>
      </details>

      <p className="support-text" style={{ marginTop: 16, fontSize: 13 }}>
        El mapa agrupa las estaciones por localidad.{" "}
        <Link href="/estaciones">Ver cada estación en una lista</Link>.
      </p>
    </div>
  );
}
