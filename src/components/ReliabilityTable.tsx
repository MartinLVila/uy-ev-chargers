import Link from "next/link";
import type { StationReliability } from "@/lib/metrics/queries";
import { formatConnectorHours, formatNumber, formatPercent } from "@/lib/ui/format";

interface ReliabilityTableProps {
  stations: StationReliability[];
}

export function ReliabilityTable({ stations }: ReliabilityTableProps) {
  if (stations.length === 0) {
    return (
      <p style={{ margin: 0, fontSize: 13, color: "var(--text-muted)" }}>
        Todavía no hay suficiente historial para calcular disponibilidad.
      </p>
    );
  }

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5, minWidth: 560 }}>
        <thead>
          <tr>
            <Th align="left">Estación</Th>
            <Th align="left">Departamento</Th>
            <Th align="right">Disponibilidad</Th>
            <Th align="right">Horas·conector caídas</Th>
            <Th align="right">Ahora</Th>
          </tr>
        </thead>
        <tbody>
          {stations.map((station) => {
            const critical = station.availability < 0.9;
            return (
              <tr key={station.slug} style={{ borderTop: "1px solid var(--border)" }}>
                <td style={{ padding: "10px 12px 10px 0" }}>
                  <Link
                    href={`/estaciones/${station.slug}`}
                    style={{ fontWeight: 500, textDecoration: "none" }}
                  >
                    {station.name}
                  </Link>
                  {station.city && (
                    <div style={{ color: "var(--text-muted)", fontSize: 12 }}>{station.city}</div>
                  )}
                </td>
                <td style={{ padding: "10px 12px 10px 0", color: "var(--text-secondary)" }}>
                  {station.department}
                </td>
                <td style={{ padding: "10px 12px 10px 0", textAlign: "right", minWidth: 150 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "flex-end" }}>
                    <span
                      style={{
                        width: 72,
                        height: 6,
                        borderRadius: 3,
                        background: "var(--surface-2)",
                        overflow: "hidden",
                        flexShrink: 0,
                      }}
                    >
                      <span
                        style={{
                          display: "block",
                          width: `${Math.max(0, Math.min(1, station.availability)) * 100}%`,
                          height: "100%",
                          borderRadius: 3,
                          background: critical ? "var(--status-critical)" : "var(--status-good)",
                        }}
                      />
                    </span>
                    <span
                      style={{
                        fontVariantNumeric: "tabular-nums",
                        fontWeight: 600,
                        color: critical ? "var(--status-critical)" : "var(--text-primary)",
                      }}
                    >
                      {formatPercent(station.availability)}
                    </span>
                  </div>
                </td>
                <td
                  style={{
                    padding: "10px 12px 10px 0",
                    textAlign: "right",
                    fontVariantNumeric: "tabular-nums",
                    color: "var(--text-secondary)",
                  }}
                >
                  {formatConnectorHours(station.outOfServiceSeconds)}
                </td>
                <td
                  style={{
                    padding: "10px 0",
                    textAlign: "right",
                    fontVariantNumeric: "tabular-nums",
                    color:
                      station.currentlyOutOfService > 0
                        ? "var(--status-critical)"
                        : "var(--text-muted)",
                    fontWeight: station.currentlyOutOfService > 0 ? 600 : 400,
                  }}
                >
                  {station.currentlyOutOfService > 0
                    ? `✕ ${formatNumber(station.currentlyOutOfService)}`
                    : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Th({ children, align }: { children: React.ReactNode; align: "left" | "right" }) {
  return (
    <th
      style={{
        textAlign: align,
        padding: "0 12px 8px 0",
        fontSize: 11.5,
        fontWeight: 500,
        textTransform: "uppercase",
        letterSpacing: "0.04em",
        color: "var(--text-muted)",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </th>
  );
}
