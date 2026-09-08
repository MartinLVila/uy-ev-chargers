import Link from "next/link";
import type { StationReliability } from "@/lib/metrics/queries";
import { formatPercent } from "@/lib/ui/format";

interface ReliabilityTableProps {
  stations: StationReliability[];
}

const MIN_BAR_PERCENT = 1.5;

function availabilityColor(availability: number): string {
  if (availability < 0.25) return "var(--status-critical)";
  if (availability < 0.55) return "var(--status-warning)";
  return "var(--status-good)";
}

export function ReliabilityTable({ stations }: ReliabilityTableProps) {
  if (stations.length === 0) {
    return (
      <p style={{ margin: 0, fontSize: 15, color: "var(--text-muted)" }}>
        Todavía no hay suficiente historial para calcular disponibilidad.
      </p>
    );
  }

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14.5, minWidth: 340 }}>
        <caption className="visually-hidden">
          Una fila por estación, con su departamento y su disponibilidad
        </caption>
        <thead>
          <tr>
            <Th align="left">Estación</Th>
            <Th align="right">Disponibilidad</Th>
          </tr>
        </thead>
        <tbody>
          {stations.map((station) => {
            const { availability } = station;
            const unclassified = availability === null;
            const color = availability === null ? "var(--text-muted)" : availabilityColor(availability);
            const barPercent =
              availability === null ? 0 : Math.max(MIN_BAR_PERCENT, Math.min(1, availability) * 100);

            return (
              <tr key={station.slug} className="row-wash" style={{ borderTop: "1px solid var(--border)" }}>
                <th scope="row" style={{ padding: "10px 12px 10px 0", textAlign: "left", fontWeight: 400 }}>
                  <Link href={`/estaciones/${station.slug}`} style={{ fontWeight: 600, fontSize: 14.5 }}>
                    {station.name}
                  </Link>
                  <div style={{ color: "var(--text-muted)", fontSize: 10, marginTop: 2 }}>
                    {station.department}
                  </div>
                </th>
                <td style={{ padding: "10px 0", textAlign: "right" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "flex-end" }}>
                    <span
                      style={{
                        width: 88,
                        height: 6,
                        borderRadius: 3,
                        background: "var(--surface-2)",
                        overflow: "hidden",
                        flexShrink: 0,
                      }}
                    >
                      {availability !== null && (
                        <span
                          className="reliability-bar-fill"
                          style={{
                            width: `${barPercent}%`,
                            background: color,
                            opacity: availability < 0.55 ? 1 : 0.8,
                          }}
                        />
                      )}
                    </span>
                    <span
                      title={unclassified ? "Ningún estado reportado pudo clasificarse" : undefined}
                      style={{
                        width: 52,
                        fontVariantNumeric: "tabular-nums",
                        fontWeight: 600,
                        color,
                      }}
                    >
                      {availability === null ? "sin clasificar" : formatPercent(availability)}
                    </span>
                  </div>
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
      scope="col"
      style={{
        textAlign: align,
        padding: "0 12px 8px 0",
        fontSize: 12,
        fontWeight: 600,
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        color: "var(--text-muted)",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </th>
  );
}
