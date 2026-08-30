"use client";

import "leaflet/dist/leaflet.css";
import Link from "next/link";
import { useMemo, useState } from "react";
import { CircleMarker, MapContainer, Popup, TileLayer } from "react-leaflet";
import type { StationStatus } from "@/lib/metrics/queries";
import { formatElapsed, formatNumber } from "@/lib/ui/format";
import {
  MARKER_PRESENTATION,
  stationMarker,
  stationPresence,
  type MarkerPresentation,
} from "@/lib/ui/health";

const URUGUAY_CENTER: [number, number] = [-32.8, -55.9];
const INITIAL_ZOOM = 7;

const LEGEND = Object.values(MARKER_PRESENTATION);

type StatusFilter = "all" | "problem";

interface StationMapProps {
  stations: StationStatus[];
}

export function StationMap({ stations }: StationMapProps) {
  const [department, setDepartment] = useState("all");
  const [status, setStatus] = useState<StatusFilter>("all");

  const departments = useMemo(
    () => [...new Set(stations.map((station) => station.department))].sort((a, b) => a.localeCompare(b, "es")),
    [stations],
  );

  const visible = useMemo(
    () =>
      stations.filter((station) => {
        if (department !== "all" && station.department !== department) return false;
        if (status === "problem" && station.outOfService === 0 && station.presence === "listed") {
          return false;
        }
        return true;
      }),
    [stations, department, status],
  );

  return (
    <div>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 12,
          alignItems: "center",
          marginBottom: 14,
        }}
      >
        <Select
          label="Departamento"
          value={department}
          onChange={setDepartment}
          options={[
            { value: "all", label: "Todos" },
            ...departments.map((name) => ({ value: name, label: name })),
          ]}
        />
        <Select
          label="Estado"
          value={status}
          onChange={(value) => setStatus(value as StatusFilter)}
          options={[
            { value: "all", label: "Todas" },
            { value: "problem", label: "Solo con problemas" },
          ]}
        />
        <span style={{ fontSize: 13, color: "var(--text-muted)", marginLeft: "auto" }}>
          {formatNumber(visible.length)} de {formatNumber(stations.length)} estaciones
        </span>
      </div>

      <div
        style={{
          height: 460,
          borderRadius: 10,
          overflow: "hidden",
          border: "1px solid var(--border)",
        }}
      >
        <MapContainer
          center={URUGUAY_CENTER}
          zoom={INITIAL_ZOOM}
          scrollWheelZoom
          style={{ height: "100%", width: "100%" }}
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          />
          {visible.map((station) => {
            const marker = stationMarker(station);
            return (
            <CircleMarker
              key={station.slug}
              center={[station.latitude, station.longitude]}
              radius={marker.radius}
              pathOptions={{
                color: "#ffffff",
                weight: 2.5,
                dashArray: marker.dashArray,
                fillColor: marker.color,
                fillOpacity: 1,
              }}
            >
              <Popup>
                <StationPopup station={station} />
              </Popup>
            </CircleMarker>
            );
          })}
        </MapContainer>
      </div>

      <ul
        style={{
          listStyle: "none",
          display: "flex",
          flexWrap: "wrap",
          gap: "8px 20px",
          margin: "14px 0 0",
          padding: 0,
          fontSize: 13,
          color: "var(--text-secondary)",
        }}
      >
        {LEGEND.map((entry) => (
          <li key={entry.label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <MarkerSwatch marker={entry} />
            <span aria-hidden style={{ color: "var(--text-primary)", fontSize: 11 }}>
              {entry.symbol}
            </span>
            {entry.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

function MarkerSwatch({ marker }: { marker: MarkerPresentation }) {
  const size = 22;
  return (
    <svg aria-hidden width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
      <circle
        cx={size / 2}
        cy={size / 2}
        r={marker.radius}
        fill={marker.color}
        stroke="#ffffff"
        strokeWidth={2.5}
        strokeDasharray={marker.dashArray}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={marker.radius + 1.5}
        fill="none"
        stroke="var(--border-strong)"
        strokeWidth={1}
      />
    </svg>
  );
}

function StationPopup({ station }: { station: StationStatus }) {
  const presence = stationPresence(station.presence);

  return (
    <div style={{ minWidth: 200 }}>
      <strong style={{ display: "block", fontSize: 14 }}>{station.name}</strong>
      <span style={{ display: "block", fontSize: 12.5, color: "var(--text-secondary)", marginTop: 2 }}>
        {[station.address, station.city, station.department].filter(Boolean).join(", ")}
      </span>

      <div style={{ marginTop: 8, fontSize: 12.5, display: "flex", flexDirection: "column", gap: 3 }}>
        <span>
          <span aria-hidden style={{ color: presence.color }}>
            {presence.symbol}
          </span>{" "}
          {presence.label}
        </span>
        <span>
          {formatNumber(station.connectors)} conectores
          {station.outOfService > 0 && (
            <span style={{ color: "var(--status-critical)", fontWeight: 600 }}>
              {" "}
              · {formatNumber(station.outOfService)} fuera de servicio
            </span>
          )}
        </span>
        <span style={{ color: "var(--text-muted)" }}>Visto {formatElapsed(station.lastSeenAt)}</span>
      </div>

      <Link
        href={`/estaciones/${station.slug}`}
        style={{ display: "inline-block", marginTop: 8, fontSize: 12.5, fontWeight: 500 }}
      >
        Ver historial →
      </Link>
    </div>
  );
}

interface SelectProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}

function Select({ label, value, onChange, options }: SelectProps) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
      <span style={{ color: "var(--text-secondary)" }}>{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        style={{
          background: "var(--surface-1)",
          color: "var(--text-primary)",
          border: "1px solid var(--border)",
          borderRadius: 8,
          padding: "6px 10px",
          fontFamily: "inherit",
          fontSize: 13,
        }}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
