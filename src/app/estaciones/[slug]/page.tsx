import Link from "next/link";
import { notFound } from "next/navigation";
import { ConnectorUsageProfile } from "@/components/ConnectorUsageProfile";
import { getDb } from "@/lib/db/client";
import {
  getStationDetail,
  getStationHourlyUsage,
  getStationStatuses,
  getWorstOutageStation,
  type ConnectorGroupHourlyUsage,
  type StationTimelineEntry,
} from "@/lib/metrics/queries";
import { windowFromDays } from "@/lib/metrics/window";
import { daysOfRange, lastDaysPhrase, observedSince, observedSpan } from "@/lib/ui/coverage";
import { formatDateTime, formatElapsed, formatNumber } from "@/lib/ui/format";
import { connectorUsage, connectorsNow, stationPresence } from "@/lib/ui/health";
import { RANKING_WINDOW_DAYS, outageSuperlative } from "@/lib/ui/station-ranking";

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

async function readNationalOutageRank(
  db: ReturnType<typeof getDb>,
  slug: string,
): Promise<number | null> {
  try {
    const worst = await getWorstOutageStation(db, windowFromDays(RANKING_WINDOW_DAYS));
    return worst?.slug === slug ? worst.outOfServiceSeconds : null;
  } catch (error) {
    console.error(`Station page ${slug} could not read the national outage ranking`, error);
    return null;
  }
}

export default async function StationPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const timeWindow = windowFromDays(WINDOW_DAYS);

  let station: Awaited<ReturnType<typeof getStationDetail>>;
  let hourlyUsage: HourlyUsageRead;
  let nationalOutageSeconds: number | null;
  try {
    const db = getDb();
    const [detail, usage, rank] = await Promise.allSettled([
      getStationDetail(db, slug, timeWindow),
      getStationHourlyUsage(db, slug, timeWindow),
      readNationalOutageRank(db, slug),
    ]);

    if (detail.status === "rejected") throw detail.reason;
    station = detail.value;
    hourlyUsage = await readHourlyUsage(slug, usage, () =>
      getStationHourlyUsage(db, slug, timeWindow),
    );
    nationalOutageSeconds = rank.status === "fulfilled" ? rank.value : null;
  } catch (error) {
    console.error(`Station page ${slug} failed`, error);
    throw error;
  }

  if (!station) notFound();

  const presence = stationPresence(station.presence);
  const now = connectorsNow(station.timeline);
  const where = [station.address, station.city, station.department].filter(Boolean).join(", ");
  const showsWholeHistory =
    !station.timelineTruncated && new Date(station.firstSeenAt) >= timeWindow.from;
  const observed = observedSpan(
    daysOfRange(observedSince(station.firstSeenAt, timeWindow), WINDOW_DAYS),
  );
  const superlative = outageSuperlative(
    nationalOutageSeconds !== null,
    nationalOutageSeconds ?? 0,
    now.outOfService,
    now.total,
  );

  return (
    <>
      <section className="band band-hero">
        <div className="container container-narrow">
          <p style={{ margin: "0 0 18px", fontSize: 15 }}>
            <Link href="/">← Volver al mapa</Link>
          </p>

          <div className="station-header-grid">
            <div>
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
              {superlative && (
                <p className="support-text" style={{ marginTop: 12 }}>
                  {superlative}
                </p>
              )}
            </div>

            <dl className="station-stats">
              <StationStat label="Conectores" value={formatNumber(now.total)} />
              <StationStat
                label="En servicio ahora"
                value={formatNumber(now.inService)}
                color="var(--status-good)"
              />
              <StationStat
                label="Fuera de servicio ahora"
                value={formatNumber(now.outOfService)}
                color={now.outOfService > 0 ? "var(--status-critical)" : undefined}
              />
              {now.unknown > 0 && (
                <StationStat
                  label="Estado desconocido"
                  value={formatNumber(now.unknown)}
                  color="var(--chart-neutral)"
                />
              )}
            </dl>
          </div>

          <p style={{ margin: "24px 0 0", fontSize: 13.5, color: "var(--text-muted)" }}>
            Según la última vez que UTE reportó esta estación, {formatElapsed(station.lastSeenAt)},
            el {formatDateTime(station.lastSeenAt)}.
          </p>
        </div>
      </section>

      <section className="band band-tinted">
        <div className="container container-narrow">
          <h2 className="section-title">A qué hora se ocupa</h2>
          <p className="support-text" style={{ marginTop: 12, marginBottom: 32 }}>
            Qué tan ocupado estuvo cada cargador en cada hora del día durante {observed}, medido
            sobre el tiempo en que estuvo en servicio.
          </p>
          {hourlyUsage.read ? (
            <ConnectorUsageProfile groups={hourlyUsage.groups} />
          ) : (
            <UsageCouldNotBeRead />
          )}
        </div>
      </section>

      <section className="band">
        <div className="container container-narrow">
          <h2 className="section-title">
            {changesHeading(showsWholeHistory, station.timelineTruncated)}
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

function changesHeading(wholeHistory: boolean, truncated: boolean): string {
  if (wholeHistory) return "Cada cambio, desde el principio";
  if (truncated) return "Cada cambio, los más recientes";
  return `Cada cambio, en ${lastDaysPhrase(WINDOW_DAYS)}`;
}

function UsageCouldNotBeRead() {
  return (
    <p style={{ margin: 0, fontSize: 15, color: "var(--text-muted)" }}>
      No pudimos leer el uso por hora al generar esta página. No quiere decir que no haya datos:
      volvé a intentar en unos minutos.
    </p>
  );
}

function StationStat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="station-stat">
      <dt className="label-caps">{label}</dt>
      <dd className="station-stat-value" style={{ color }}>
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
      <ul className="hairline-list" role="list">
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
                padding: "12px 0",
                fontSize: 12,
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
