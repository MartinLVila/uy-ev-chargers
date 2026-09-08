"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { formatNumber } from "@/lib/ui/format";
import {
  localityState,
  localityTooltip,
  VIEW_HEIGHT,
  VIEW_WIDTH,
  type CountryPath,
  type LocalityPoint,
} from "@/lib/ui/hud-map";

export function HudMapView({
  paths,
  points,
}: {
  paths: CountryPath[];
  points: LocalityPoint[];
}) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const tooltipId = useId();
  const active = activeIndex !== null ? points[activeIndex] : null;

  return (
    <div className="hud-map-wrap">
      <p className="visually-hidden">
        Mapa de la red de carga: {formatNumber(points.length)} localidades, cada una como un
        círculo. Cada círculo es alcanzable con el tabulador y describe su propio estado; abajo
        hay la misma información en una lista.
      </p>

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

        {points.map((point, index) => {
          const state = localityState(point);
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
              <circle
                className={`hud-locality hud-locality-${state}`}
                data-active={activeIndex === index || undefined}
                cx={point.x}
                cy={point.y}
                r={point.radius}
                tabIndex={0}
                role="button"
                aria-label={localityTooltip(point)}
                aria-describedby={activeIndex === index ? tooltipId : undefined}
                onMouseEnter={() => setActiveIndex(index)}
                onMouseLeave={() => setActiveIndex((current) => (current === index ? null : current))}
                onFocus={() => setActiveIndex(index)}
                onBlur={() => setActiveIndex((current) => (current === index ? null : current))}
                onClick={() => setActiveIndex((current) => (current === index ? null : index))}
              />
            </g>
          );
        })}
      </svg>

      {active && (
        <div
          id={tooltipId}
          role="tooltip"
          className="hud-tooltip"
          style={{
            left: `${(active.x / VIEW_WIDTH) * 100}%`,
            top: `${(active.y / VIEW_HEIGHT) * 100}%`,
          }}
        >
          <strong>{active.name}</strong>
          <span>{localityTooltip(active)}</span>
        </div>
      )}

      <details className="hud-map-fallback">
        <summary>Ver las {formatNumber(points.length)} localidades en una lista</summary>
        <ul role="list" className="hairline-list" style={{ marginTop: 10 }}>
          {points.map((point) => (
            <li key={`${point.name}-${point.department}`} className="row-wash station-row">
              <span>
                <span className="station-row-name">{point.name}</span>
                <span className="station-row-city"> · {point.department}</span>
              </span>
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
