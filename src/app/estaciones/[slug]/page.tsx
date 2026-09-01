import Link from "next/link";
import { notFound } from "next/navigation";
import { ConnectorHistory } from "@/components/ConnectorHistory";
import { ConnectorUsageProfile } from "@/components/ConnectorUsageProfile";
import { getDb } from "@/lib/db/client";
import {
  getStationDetail,
  getStationHourlyUsage,
  getStationStatuses,
  type ConnectorGroupHourlyUsage,
  type StationTimelineEntry,
} from "@/lib/metrics/queries";
import { windowFromDays } from "@/lib/metrics/window";
import { formatDateTime, formatNumber } from "@/lib/ui/format";
import { connectorUsage, connectorUsageState, stationPresence } from "@/lib/ui/health";

export const revalidate = 60;

const WINDOW_DAYS = 90;

export async function generateStaticParams(): Promise<{ slug: string }[]> {
  try {
    const stations = await getStationStatuses(getDb());
    return stations.map((station) => ({ slug: station.slug }));
  } catch (error) {
    console.error("Could not enumerate stations to prerender", error);
    return [];
  }
}

export interface ConnectorsNow {
  total: number;
  inService: number;
  outOfService: number;
  unknown: number;
}

export function connectorsNow(timeline: StationTimelineEntry[]): ConnectorsNow {
  const open = timeline.filter((entry) => entry.endedAt === null);

  return open.reduce<ConnectorsNow>(
    (running, entry) => {
      const state = connectorUsageState(entry.health, entry.statusDetail);
      const inService = state === "free" || state === "inUse";
      const outOfService = state === "broken" || state === "absent";
      return {
        total: running.total + entry.connectorCount,
        inService: running.inService + (inService ? entry.connectorCount : 0),
        outOfService: running.outOfService + (outOfService ? entry.connectorCount : 0),
        unknown: running.unknown + (inService || outOfService ? 0 : entry.connectorCount),
      };
    },
    { total: 0, inService: 0, outOfService: 0, unknown: 0 },
  );
}

export default async function StationPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const timeWindow = windowFromDays(WINDOW_DAYS);

  let station: Awaited<ReturnType<typeof getStationDetail>>;
  let hourlyUsage: ConnectorGroupHourlyUsage[] = [];
  try {
    const db = getDb();
    const [detail, usage] = await Promise.allSettled([
      getStationDetail(db, slug, timeWindow),
      getStationHourlyUsage(db, slug, timeWindow),
    ]);

    if (detail.status === "rejected") throw detail.reason;
    station = detail.value;

    if (usage.status === "fulfilled") hourlyUsage = usage.value;
    else console.error(`Station page ${slug} could not read hourly usage`, usage.reason);
  } catch (error) {
    console.error(`Station page ${slug} failed`, error);
    return (
      <div className="container" style={{ paddingTop: 58, paddingBottom: 58 }}>
        <h1 className="section-title">No se pudo cargar la estación</h1>
        <p className="support-text" style={{ marginTop: 12, maxWidth: 640 }}>
          La base de datos no respondió. Probá de nuevo en unos minutos.
        </p>
        <p style={{ margin: "16px 0 0", fontSize: 15 }}>
          <Link href="/">← Volver al mapa</Link>
        </p>
      </div>
    );
  }

  if (!station) notFound();

  const presence = stationPresence(station.presence);
  const now = connectorsNow(station.timeline);
  const where = [station.address, station.city, station.department].filter(Boolean).join(", ");
  const showsWholeHistory =
    !station.timelineTruncated && new Date(station.firstSeenAt) >= timeWindow.from;

  return (
    <>
      <section className="band band-hero">
        <div className="container">
          <p style={{ margin: "0 0 18px", fontSize: 15 }}>
            <Link href="/" style={{ color: "var(--text-secondary)" }}>
              ← Volver al mapa
            </Link>
          </p>
          {where && <span className="label-caps">{where}</span>}
          <h1 className="figure-name" style={{ marginTop: where ? 14 : 0 }}>
            {station.name}
          </h1>
          <p className="support-text" style={{ marginTop: 16 }}>
            <span aria-hidden style={{ color: presence.color }}>
              {presence.symbol}
            </span>{" "}
            {presence.label} · vista por primera vez el {formatDateTime(station.firstSeenAt)}
          </p>
        </div>
      </section>

      <section className="band">
        <div className="container">
          <h2 className="visually-hidden">Los conectores de esta estación ahora mismo</h2>
          <dl className="figure-row">
            <StationFigure label="Conectores" value={formatNumber(now.total)} />
            <StationFigure label="En servicio ahora" value={formatNumber(now.inService)} />
            <StationFigure
              label="Fuera de servicio ahora"
              value={formatNumber(now.outOfService)}
              color={now.outOfService > 0 ? "var(--status-critical)" : undefined}
            />
            {now.unknown > 0 && (
              <StationFigure
                label="Estado desconocido"
                value={formatNumber(now.unknown)}
                color="var(--chart-neutral)"
              />
            )}
          </dl>
        </div>
      </section>

      <section className="band band-tinted">
        <div className="container">
          <h2 className="section-title">Cómo estuvo cada cargador</h2>
          <p className="support-text" style={{ marginTop: 12, marginBottom: 32 }}>
            Cada barra muestra la evolución de un conector en los últimos {WINDOW_DAYS} días: libre,
            en uso o fuera de servicio.
          </p>
          <ConnectorHistory
            timeline={station.timeline}
            timelineCoversFrom={station.timelineCoversFrom}
            firstSeenAt={station.firstSeenAt}
            windowStart={timeWindow.from.toISOString()}
            windowEnd={timeWindow.to.toISOString()}
          />
        </div>
      </section>

      <section className="band">
        <div className="container">
          <h2 className="section-title">A qué hora se ocupa</h2>
          <p className="support-text" style={{ marginTop: 12, marginBottom: 32 }}>
            Qué tan ocupado estuvo cada cargador en cada hora del día durante los últimos{" "}
            {WINDOW_DAYS} días, medido sobre el tiempo en que estuvo en servicio.
          </p>
          <ConnectorUsageProfile groups={hourlyUsage} />
        </div>
      </section>

      <section className="band band-tinted">
        <div className="container">
          <h2 className="section-title">
            {showsWholeHistory
              ? "Cada cambio, desde el principio"
              : `Cada cambio, últimos ${WINDOW_DAYS} días`}
          </h2>
          <p className="support-text" style={{ marginTop: 12, marginBottom: 32 }}>
            Cada fila es un intervalo durante el cual el grupo de conectores mantuvo el mismo estado.
            {!showsWholeHistory &&
              " Los cambios anteriores a esa ventana no se muestran."}
          </p>
          <StateHistory
            timeline={station.timeline}
            truncated={station.timelineTruncated}
          />
        </div>
      </section>
    </>
  );
}

function StationFigure({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <dt className="label-caps">{label}</dt>
      <dd className="figure-major" style={{ margin: "10px 0 0", color }}>
        {value}
      </dd>
    </div>
  );
}

function StateHistory({
  timeline,
  truncated,
}: {
  timeline: StationTimelineEntry[];
  truncated: boolean;
}) {
  if (timeline.length === 0) {
    return (
      <p style={{ margin: 0, fontSize: 15, color: "var(--text-muted)" }}>
        No hay cambios de estado registrados en este período.
      </p>
    );
  }

  return (
    <div>
      {truncated && (
        <p style={{ margin: "0 0 16px", fontSize: 13.5, color: "var(--text-muted)" }}>
          Se muestran los {formatNumber(timeline.length)} cambios más recientes; hay más registros
          en este período.
        </p>
      )}
      <ul className="hairline-list">
        {timeline.map((entry, index) => {
          const usage = connectorUsage(entry.health, entry.statusDetail);
          return (
            <li
              key={`${entry.startedAt}-${entry.connectorType}-${entry.powerKw}-${index}`}
              className="row-wash"
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "baseline",
                justifyContent: "space-between",
                gap: "6px 24px",
                padding: "14px 0",
                fontSize: 14.5,
              }}
            >
              <span style={{ fontWeight: 600, minWidth: 0 }}>
                {entry.connectorType} · {entry.powerKw} kW
                <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>
                  {entry.hasCable ? " · con cable" : " · sin cable"} ·{" "}
                  {formatNumber(entry.connectorCount)}{" "}
                  {entry.connectorCount === 1 ? "conector" : "conectores"}
                </span>
              </span>
              <span style={{ minWidth: 0 }}>
                <span aria-hidden style={{ color: usage.color }}>
                  {usage.symbol}
                </span>{" "}
                {usage.label}
                <span style={{ color: "var(--text-muted)" }}> ({entry.statusDetail})</span>
              </span>
              <span
                style={{
                  color: "var(--text-secondary)",
                  fontVariantNumeric: "tabular-nums",
                  whiteSpace: "nowrap",
                }}
              >
                {formatDateTime(entry.startedAt)} →{" "}
                {entry.endedAt ? formatDateTime(entry.endedAt) : "en curso"}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
