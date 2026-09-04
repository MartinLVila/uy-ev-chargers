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
import { formatDateTime, formatElapsed, formatNumber } from "@/lib/ui/format";
import { connectorUsage, connectorsNow, stationPresence } from "@/lib/ui/health";

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

type HourlyUsageRead =
  | { read: true; groups: ConnectorGroupHourlyUsage[] }
  | { read: false };

const RETRY_AFTER_MS = 250;

async function readHourlyUsage(
  slug: string,
  settled: PromiseSettledResult<ConnectorGroupHourlyUsage[]>,
  readAgain: () => Promise<ConnectorGroupHourlyUsage[]>,
): Promise<HourlyUsageRead> {
  if (settled.status === "fulfilled") return { read: true, groups: settled.value };

  console.error(`Station page ${slug} could not read hourly usage, retrying`, settled.reason);
  await new Promise((resume) => setTimeout(resume, RETRY_AFTER_MS));

  try {
    return { read: true, groups: await readAgain() };
  } catch (error) {
    console.error(`Station page ${slug} could not read hourly usage`, error);
    return { read: false };
  }
}

export default async function StationPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const timeWindow = windowFromDays(WINDOW_DAYS);

  let station: Awaited<ReturnType<typeof getStationDetail>>;
  let hourlyUsage: HourlyUsageRead;
  try {
    const db = getDb();
    const [detail, usage] = await Promise.allSettled([
      getStationDetail(db, slug, timeWindow),
      getStationHourlyUsage(db, slug, timeWindow),
    ]);

    if (detail.status === "rejected") throw detail.reason;
    station = detail.value;
    hourlyUsage = await readHourlyUsage(slug, usage, () =>
      getStationHourlyUsage(db, slug, timeWindow),
    );
  } catch (error) {
    console.error(`Station page ${slug} failed`, error);
    return (
      <div className="container" style={{ paddingTop: 58, paddingBottom: 58 }}>
        <h1 className="section-title">No se pudo cargar la estación</h1>
        <p className="support-text" style={{ marginTop: 12, maxWidth: 640 }}>
          No pudimos leer los datos de esta estación en este momento. Probá de nuevo en unos
          minutos.
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
            <Link href="/">← Volver al mapa</Link>
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
          <p style={{ margin: "24px 0 0", fontSize: 13.5, color: "var(--text-muted)" }}>
            Según la última vez que UTE reportó esta estación, {formatElapsed(station.lastSeenAt)},
            el {formatDateTime(station.lastSeenAt)}.
          </p>
        </div>
      </section>

      <section className="band band-tinted">
        <div className="container">
          <h2 className="section-title">Cómo estuvo cada cargador</h2>
          <p className="support-text" style={{ marginTop: 12, marginBottom: 32 }}>
            Una fila por conector y una celda por día, con el estado que más duró ese día, durante
            los últimos {WINDOW_DAYS} días.
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
          {hourlyUsage.read ? (
            <ConnectorUsageProfile groups={hourlyUsage.groups} />
          ) : (
            <UsageCouldNotBeRead />
          )}
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

function UsageCouldNotBeRead() {
  return (
    <p style={{ margin: 0, fontSize: 15, color: "var(--text-muted)" }}>
      No pudimos leer el uso por hora al generar esta página. No quiere decir que no haya datos:
      volvé a intentar en unos minutos.
    </p>
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
