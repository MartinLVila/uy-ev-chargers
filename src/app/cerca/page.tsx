import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getDb } from "@/lib/db/client";
import {
  getStationDetail,
  getStationHourlyUsage,
  getStationReliability,
  getStationStatuses,
  type StationReliability,
  type StationStatus,
} from "@/lib/metrics/queries";
import { windowFromDays } from "@/lib/metrics/window";
import { aggregateByLocality, type LocalityAggregate } from "@/lib/ui/locality";
import { formatNumber, formatPercent } from "@/lib/ui/format";
import { availabilityClaim } from "@/lib/ui/near-me";
import { connectorsNowByUsage, stationPresence, type ConnectorTallyByUsage } from "@/lib/ui/health";
import { buildUsageProfiles, usageProfileName } from "@/lib/ui/hourly-usage";
import { describeUsagePattern, usagePattern } from "@/lib/ui/usage-windows";

export const revalidate = 60;

const USAGE_WINDOW_DAYS = 90;
const ALTERNATIVES_WINDOW_DAYS = 30;
const MAX_PIPS = 24;
const MAX_ALTERNATIVES = 3;

interface CercaSearchParams {
  localidad?: string;
  estacion?: string;
}

export default async function NearMePage({
  searchParams,
}: {
  searchParams: Promise<CercaSearchParams>;
}) {
  const { localidad, estacion } = await searchParams;
  const db = getDb();
  const stations = await getStationStatuses(db);
  const localities = aggregateByLocality(stations);

  if (!localidad) {
    return <LocalityPicker localities={localities} />;
  }

  const locality = localities.find((candidate) => candidate.name === localidad);
  if (!locality) {
    return <LocalityPicker localities={localities} notFoundFor={localidad} />;
  }

  if (!estacion) {
    if (locality.memberStations.length === 1) {
      redirect(
        `/cerca?localidad=${encodeURIComponent(locality.name)}&estacion=${locality.memberStations[0].slug}`,
      );
    }
    return <StationPicker locality={locality} />;
  }

  const station = locality.memberStations.find((candidate) => candidate.slug === estacion);
  if (!station) notFound();

  const window = windowFromDays(USAGE_WINDOW_DAYS);
  const [detail, hourlyUsage, reliability] = await Promise.all([
    getStationDetail(db, estacion, window).catch((error) => {
      console.error(`/cerca could not read detail for ${estacion}`, error);
      return null;
    }),
    getStationHourlyUsage(db, estacion, window).catch((error) => {
      console.error(`/cerca could not read hourly usage for ${estacion}`, error);
      return [];
    }),
    getStationReliability(db, windowFromDays(ALTERNATIVES_WINDOW_DAYS), { limit: 1000 }).catch(
      (error) => {
        console.error("/cerca could not read alternatives' reliability", error);
        return [];
      },
    ),
  ]);

  if (!detail) {
    return (
      <NearMeShell>
        <p className="support-text">
          No pudimos leer el estado de esta estación en este momento. Volvé a intentar en unos
          minutos.
        </p>
      </NearMeShell>
    );
  }

  const tally = connectorsNowByUsage(detail.timeline);
  const alternatives = pickAlternatives(locality, estacion, reliability);
  const profiles = buildUsageProfiles(hourlyUsage);

  return (
    <NearMeShell>
      <p className="label-caps">{locality.name}</p>
      <h1 className="figure-name" style={{ marginTop: 10 }}>
        {station.name}
      </h1>

      <PipStrip tally={tally} />

      <p className="support-text" style={{ marginTop: 12 }}>
        {formatNumber(tally.free)} libres · {formatNumber(tally.broken + tally.absent)} fuera de
        servicio
      </p>
      <p style={{ margin: "8px 0 0", fontSize: 15, fontWeight: 600 }}>
        {availabilityClaim(detail.presence, tally)}
      </p>

      {profiles.map((profile) => (
        <div key={profile.connectorGroupId} style={{ marginTop: 28, paddingTop: 20, borderTop: "1px solid var(--border)" }}>
          <p className="near-me-power">
            {formatNumber(profile.powerKw)} <span style={{ fontSize: 16, fontWeight: 600 }}>kW</span>
          </p>
          <p className="support-text" style={{ marginTop: 4, fontSize: 14 }}>
            {usageProfileName(profile)}
          </p>
          <p style={{ margin: "10px 0 0", fontSize: 14, color: "var(--text-secondary)" }}>
            {describeUsagePattern(usagePattern(profile))}
          </p>
        </div>
      ))}

      {alternatives.length > 0 && (
        <div style={{ marginTop: 32 }}>
          <p className="label-caps">Si está ocupada</p>
          <ul role="list" className="hairline-list" style={{ marginTop: 12 }}>
            {alternatives.map((alt) => (
              <li key={alt.slug} className="row-wash" style={{ display: "flex", justifyContent: "space-between", padding: "12px 0", fontSize: 14.5 }}>
                <Link href={`/cerca?localidad=${encodeURIComponent(locality.name)}&estacion=${alt.slug}`}>
                  {alt.name}
                </Link>
                <span style={{ color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>
                  {alt.availability === null ? "sin clasificar" : formatPercent(alt.availability)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p style={{ margin: "24px 0 0" }}>
        <Link href={`/cerca?localidad=${encodeURIComponent(locality.name)}`}>
          ← Elegir otra estación en {locality.name}
        </Link>
      </p>
    </NearMeShell>
  );
}

interface Alternative {
  slug: string;
  name: string;
  availability: number | null;
}

function pickAlternatives(
  locality: LocalityAggregate,
  currentSlug: string,
  reliability: StationReliability[],
): Alternative[] {
  const bySlug = new Map(reliability.map((row) => [row.slug, row]));

  return locality.memberStations
    .filter((station) => station.slug !== currentSlug)
    .map(
      (station): Alternative => ({
        slug: station.slug,
        name: station.name,
        availability: bySlug.get(station.slug)?.availability ?? null,
      }),
    )
    .sort((a, b) => (b.availability ?? -1) - (a.availability ?? -1))
    .slice(0, MAX_ALTERNATIVES);
}

function PipStrip({ tally }: { tally: ConnectorTallyByUsage }) {
  const pips: Array<"free" | "inUse" | "broken" | "absent" | "unknown"> = [];
  const push = (state: "free" | "inUse" | "broken" | "absent" | "unknown", count: number) => {
    for (let index = 0; index < count; index += 1) pips.push(state);
  };
  push("broken", tally.broken);
  push("absent", tally.absent);
  push("unknown", tally.unknown);
  push("inUse", tally.inUse);
  push("free", tally.free);

  const shown = pips.slice(0, MAX_PIPS);
  const truncated = pips.length > MAX_PIPS;
  const color: Record<string, string> = {
    free: "var(--status-good)",
    inUse: "var(--state-neutral)",
    broken: "var(--status-critical)",
    absent: "var(--status-warning)",
    unknown: "var(--chart-neutral)",
  };

  return (
    <div style={{ marginTop: 20 }}>
      <div className="near-me-pip-row" role="img" aria-label={`${tally.total} conectores: ${tally.free} libres, ${tally.inUse} en uso, ${tally.broken} con falla, ${tally.absent} sin reportar, ${tally.unknown} desconocidos.`}>
        {shown.map((state, index) => (
          <span key={index} className="near-me-pip" style={{ background: color[state] }} aria-hidden="true" />
        ))}
      </div>
      {truncated && (
        <p style={{ margin: "6px 0 0", fontSize: 11, color: "var(--text-muted)" }}>
          Mostrando {MAX_PIPS} de {pips.length} conectores.
        </p>
      )}
    </div>
  );
}

function LocalityPicker({
  localities,
  notFoundFor,
}: {
  localities: LocalityAggregate[];
  notFoundFor?: string;
}) {
  return (
    <NearMeShell>
      <h1 className="section-title">¿Dónde estás?</h1>
      <p className="support-text" style={{ marginTop: 12 }}>
        Elegí una localidad para ver sus estaciones. Esto se calcula en tu navegador; no compartimos
        tu ubicación.
      </p>
      {notFoundFor && (
        <p style={{ marginTop: 12, fontSize: 13.5, color: "var(--status-warning)" }}>
          No encontramos «{notFoundFor}». Elegí una localidad de la lista.
        </p>
      )}
      <ul role="list" className="hairline-list" style={{ marginTop: 20 }}>
        {localities.map((locality) => (
          <li key={`${locality.name}-${locality.department}`} className="row-wash">
            <Link
              href={`/cerca?localidad=${encodeURIComponent(locality.name)}`}
              style={{ display: "flex", justifyContent: "space-between", padding: "12px 0", fontSize: 14.5 }}
            >
              <span>
                {locality.name}
                <span style={{ color: "var(--text-muted)" }}> · {locality.department}</span>
              </span>
              <span style={{ color: "var(--text-secondary)" }}>
                {formatNumber(locality.stations)} {locality.stations === 1 ? "estación" : "estaciones"}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </NearMeShell>
  );
}

function StationPicker({ locality }: { locality: LocalityAggregate }) {
  return (
    <NearMeShell>
      <p style={{ margin: "0 0 12px", fontSize: 15 }}>
        <Link href="/cerca">← Elegir otra localidad</Link>
      </p>
      <h1 className="section-title">{locality.name}</h1>
      <p className="support-text" style={{ marginTop: 12 }}>
        {formatNumber(locality.memberStations.length)} estaciones. Elegí una.
      </p>
      <ul role="list" className="hairline-list" style={{ marginTop: 20 }}>
        {locality.memberStations
          .slice()
          .sort((a, b) => a.name.localeCompare(b.name, "es"))
          .map((station) => (
            <StationPickerRow key={station.slug} locality={locality} station={station} />
          ))}
      </ul>
    </NearMeShell>
  );
}

function StationPickerRow({
  locality,
  station,
}: {
  locality: LocalityAggregate;
  station: StationStatus;
}) {
  const presence = stationPresence(station.presence);

  return (
    <li className="row-wash">
      <Link
        href={`/cerca?localidad=${encodeURIComponent(locality.name)}&estacion=${station.slug}`}
        style={{ display: "flex", justifyContent: "space-between", padding: "12px 0", fontSize: 14.5 }}
      >
        <span>
          <span aria-hidden style={{ color: presence.color }}>
            {presence.symbol}
          </span>{" "}
          {station.name}
        </span>
        <span style={{ color: "var(--text-secondary)" }}>
          {formatNumber(station.connectors)} {station.connectors === 1 ? "conector" : "conectores"}
        </span>
      </Link>
    </li>
  );
}

function NearMeShell({ children }: { children: React.ReactNode }) {
  return (
    <section className="band" style={{ paddingBottom: 96 }}>
      <div className="container container-narrow">{children}</div>
    </section>
  );
}
