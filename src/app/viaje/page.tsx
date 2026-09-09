import Link from "next/link";
import { getDb } from "@/lib/db/client";
import {
  getDepartmentBreakdown,
  getStationReliability,
  type StationReliability,
} from "@/lib/metrics/queries";
import { windowFromDays } from "@/lib/metrics/window";
import { formatNumber, formatPercent } from "@/lib/ui/format";

export const revalidate = 60;

const RELIABILITY_WINDOW_DAYS = 30;
const RELIABILITY_FETCH_LIMIT = 1000;

interface TripSearchParams {
  departamento?: string;
}

export default async function TripPage({
  searchParams,
}: {
  searchParams: Promise<TripSearchParams>;
}) {
  const { departamento } = await searchParams;
  const db = getDb();

  let departments: Awaited<ReturnType<typeof getDepartmentBreakdown>>;
  try {
    departments = await getDepartmentBreakdown(db);
  } catch (error) {
    console.error("/viaje could not read department breakdown", error);
    throw error;
  }

  if (!departamento) {
    return <DepartmentPicker departments={departments} />;
  }

  const department = departments.find((row) => row.department === departamento);
  if (!department) {
    return <DepartmentPicker departments={departments} notFoundFor={departamento} />;
  }

  const reliability = await getStationReliability(
    db,
    windowFromDays(RELIABILITY_WINDOW_DAYS),
    { limit: RELIABILITY_FETCH_LIMIT },
  ).catch((error) => {
    console.error(`/viaje could not read reliability for ${departamento}`, error);
    return [] as StationReliability[];
  });

  const stations = reliability
    .filter((row) => row.department === departamento)
    .sort((a, b) => (b.availability ?? -1) - (a.availability ?? -1));

  return (
    <TripShell>
      <p style={{ margin: "0 0 12px", fontSize: 15 }}>
        <Link href="/viaje">← Elegir otro departamento</Link>
      </p>
      <h1 className="section-title">{department.department}</h1>
      <p className="support-text" style={{ marginTop: 12 }}>
        {stations.length === 0
          ? "Todavía no hay suficiente historial para ordenar estas estaciones por confiabilidad."
          : `${formatNumber(stations.length)} estaciones, ordenadas por disponibilidad de los últimos ${RELIABILITY_WINDOW_DAYS} días.`}
      </p>
      <p style={{ margin: "8px 0 0", fontSize: 13, color: "var(--text-muted)" }}>
        Esto no dice si tu auto llega con la batería que tenés — es qué tan seguido estuvo
        funcionando cada estación. La decisión de cuánta batería te va a hacer falta es tuya.
      </p>

      {stations.length > 0 && (
        <ul role="list" className="hairline-list" style={{ marginTop: 20 }}>
          {stations.map((station) => (
            <TripStationRow key={station.slug} station={station} />
          ))}
        </ul>
      )}
    </TripShell>
  );
}

function TripStationRow({ station }: { station: StationReliability }) {
  const color =
    station.availability === null
      ? "var(--text-muted)"
      : station.availability < 0.25
        ? "var(--status-critical)"
        : station.availability < 0.55
          ? "var(--status-warning)"
          : "var(--status-good)";

  return (
    <li className="row-wash">
      <Link
        href={`/estaciones/${station.slug}`}
        style={{ display: "flex", justifyContent: "space-between", padding: "12px 0", fontSize: 14.5 }}
      >
        <span>
          {station.name}
          {station.city && <span style={{ color: "var(--text-muted)" }}> · {station.city}</span>}
        </span>
        <span style={{ color, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
          {station.availability === null ? "sin clasificar" : formatPercent(station.availability)}
        </span>
      </Link>
    </li>
  );
}

function DepartmentPicker({
  departments,
  notFoundFor,
}: {
  departments: { department: string; stations: number }[];
  notFoundFor?: string;
}) {
  const sorted = [...departments].sort((a, b) => a.department.localeCompare(b.department, "es"));

  return (
    <TripShell>
      <h1 className="section-title">¿A dónde vas?</h1>
      <p className="support-text" style={{ marginTop: 12 }}>
        Elegí el departamento de destino para ver qué estaciones funcionaron de forma confiable
        ahí. No calculamos rutas ni distancias — esto es historial, no un veredicto sobre si
        llegás.
      </p>
      {notFoundFor && (
        <p style={{ marginTop: 12, fontSize: 13.5, color: "var(--status-warning)" }}>
          No encontramos «{notFoundFor}». Elegí un departamento de la lista.
        </p>
      )}
      <ul role="list" className="hairline-list" style={{ marginTop: 20 }}>
        {sorted.map((row) => (
          <li key={row.department} className="row-wash">
            <Link
              href={`/viaje?departamento=${encodeURIComponent(row.department)}`}
              style={{ display: "flex", justifyContent: "space-between", padding: "12px 0", fontSize: 14.5 }}
            >
              <span>{row.department}</span>
              <span style={{ color: "var(--text-secondary)" }}>
                {formatNumber(row.stations)} {row.stations === 1 ? "estación" : "estaciones"}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </TripShell>
  );
}

function TripShell({ children }: { children: React.ReactNode }) {
  return (
    <section className="band" style={{ paddingBottom: 96 }}>
      <div className="container container-narrow">{children}</div>
    </section>
  );
}
