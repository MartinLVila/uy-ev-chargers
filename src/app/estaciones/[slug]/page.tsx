import Link from "next/link";
import { notFound } from "next/navigation";
import { Card } from "@/components/Card";
import { ConnectorHistory } from "@/components/ConnectorHistory";
import { getDb } from "@/lib/db/client";
import { getStationDetail } from "@/lib/metrics/queries";
import { windowFromDays } from "@/lib/metrics/window";
import { formatDateTime, formatNumber } from "@/lib/ui/format";
import { connectorUsage, stationPresence } from "@/lib/ui/health";

export const dynamic = "force-dynamic";

const WINDOW_DAYS = 90;

export default async function StationPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const timeWindow = windowFromDays(WINDOW_DAYS);

  let station: Awaited<ReturnType<typeof getStationDetail>>;
  try {
    station = await getStationDetail(getDb(), slug, timeWindow);
  } catch (error) {
    console.error(`Station page ${slug} failed`, error);
    return (
      <div
        style={{
          background: "var(--surface-1)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          padding: 24,
          maxWidth: 640,
        }}
      >
        <h1 style={{ margin: "0 0 8px", fontSize: 18, fontWeight: 600 }}>
          No se pudo cargar la estación
        </h1>
        <p style={{ margin: 0, fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.6 }}>
          La base de datos no respondió. Probá de nuevo en unos minutos.
        </p>
        <p style={{ margin: "12px 0 0", fontSize: 13.5 }}>
          <Link href="/">← Volver al mapa</Link>
        </p>
      </div>
    );
  }

  if (!station) notFound();

  const presence = stationPresence(station.presence);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <Link href="/" style={{ fontSize: 13, color: "var(--text-secondary)" }}>
          ← Volver al mapa
        </Link>
        <h1 style={{ margin: "10px 0 6px", fontSize: 26, fontWeight: 600, letterSpacing: "-0.02em" }}>
          {station.name}
        </h1>
        <p style={{ margin: 0, color: "var(--text-secondary)", fontSize: 14 }}>
          {[station.address, station.city, station.department].filter(Boolean).join(", ")}
        </p>
        <p style={{ margin: "10px 0 0", fontSize: 13.5 }}>
          <span aria-hidden style={{ color: presence.color }}>
            {presence.symbol}
          </span>{" "}
          {presence.label}
          <span style={{ color: "var(--text-muted)" }}>
            {" "}
            · vista por primera vez el {formatDateTime(station.firstSeenAt)}
          </span>
        </p>
      </div>

      <Card
        title={`Historial por cargador (${WINDOW_DAYS} días)`}
        description="Cada barra muestra la evolución de un conector en el tiempo: libre, en uso o fuera de servicio."
      >
        <ConnectorHistory
          timeline={station.timeline}
          firstSeenAt={station.firstSeenAt}
          windowStart={timeWindow.from.toISOString()}
          windowEnd={timeWindow.to.toISOString()}
        />
      </Card>

      <Card
        title={`Historial de estados (${WINDOW_DAYS} días)`}
        description="Cada fila es un intervalo durante el cual el grupo de conectores mantuvo el mismo estado."
      >
        {station.timeline.length === 0 ? (
          <p style={{ margin: 0, fontSize: 13, color: "var(--text-muted)" }}>
            No hay cambios de estado registrados en este período.
          </p>
        ) : (
          <div>
            {station.timelineTruncated && (
              <p style={{ margin: "0 0 12px", fontSize: 13, color: "var(--text-muted)" }}>
                Se muestran los {formatNumber(station.timeline.length)} cambios más recientes; hay
                más registros en este período.
              </p>
            )}
            <div style={{ overflowX: "auto" }}>
            <table
              style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5, minWidth: 620 }}
            >
              <thead>
                <tr>
                  <Th>Conector</Th>
                  <Th>Estado</Th>
                  <Th align="right">Cantidad</Th>
                  <Th>Desde</Th>
                  <Th>Hasta</Th>
                </tr>
              </thead>
              <tbody>
                {station.timeline.map((entry, index) => {
                  const usage = connectorUsage(entry.health, entry.statusDetail);
                  return (
                    <tr
                      key={`${entry.startedAt}-${entry.connectorType}-${entry.powerKw}-${index}`}
                      style={{ borderTop: "1px solid var(--border)" }}
                    >
                      <td style={{ padding: "10px 12px 10px 0" }}>
                        {entry.connectorType} · {entry.powerKw} kW
                        <span style={{ color: "var(--text-muted)" }}>
                          {entry.hasCable ? " · con cable" : " · sin cable"}
                        </span>
                      </td>
                      <td style={{ padding: "10px 12px 10px 0" }}>
                        <span aria-hidden style={{ color: usage.color }}>
                          {usage.symbol}
                        </span>{" "}
                        {usage.label}
                        <span style={{ color: "var(--text-muted)" }}> ({entry.statusDetail})</span>
                      </td>
                      <td
                        style={{
                          padding: "10px 12px 10px 0",
                          textAlign: "right",
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {formatNumber(entry.connectorCount)}
                      </td>
                      <td style={{ padding: "10px 12px 10px 0", color: "var(--text-secondary)" }}>
                        {formatDateTime(entry.startedAt)}
                      </td>
                      <td style={{ padding: "10px 0", color: "var(--text-secondary)" }}>
                        {entry.endedAt ? formatDateTime(entry.endedAt) : "en curso"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

function Th({ children, align = "left" }: { children: React.ReactNode; align?: "left" | "right" }) {
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
