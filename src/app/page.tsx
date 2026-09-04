import { DepartmentChart } from "@/components/DepartmentChart";
import { HealthBar } from "@/components/HealthBar";
import { HistoryChart } from "@/components/HistoryChart";
import { ReliabilityTable } from "@/components/ReliabilityTable";
import { StationList } from "@/components/StationList";
import { StationMapPanel } from "@/components/StationMapPanel";
import { loadDashboard } from "@/lib/metrics/dashboard";
import { daysOfHistory, lastDaysHeading, lastDaysSentence } from "@/lib/ui/coverage";
import { formatDateTime, formatElapsed, formatNumber, formatPercent } from "@/lib/ui/format";

export const revalidate = 60;

export default async function DashboardPage() {
  const data = await loadDashboard();

  if (!data) {
    return (
      <Notice title="No se pudieron cargar los datos">
        No pudimos leer los datos en este momento. Probá de nuevo en unos minutos.
      </Notice>
    );
  }

  const { snapshot, feed, departments, stations, reliability, history, historyDays, reliabilityDays } =
    data;

  if (snapshot.stations.total === 0) {
    return (
      <Notice title="Todavía no hay datos">
        Todavía no se registró ninguna lectura del feed de UTE. Volvé a intentar más tarde.
      </Notice>
    );
  }

  const fleet = snapshot.connectors.reported + snapshot.connectors.absent;
  const outOfServiceRatio = fleet > 0 ? snapshot.connectors.outOfService / fleet : 0;
  const historyCovers = daysOfHistory(history, historyDays);
  const reliabilityCovers = daysOfHistory(history, reliabilityDays);

  return (
    <>
      <FeedWarning feed={feed} />

      <section className="band band-hero">
        <div className="container">
          <h1 style={{ margin: 0 }}>
            <span
              className="figure-hero"
              style={{
                color:
                  snapshot.connectors.outOfService > 0
                    ? "var(--status-critical)"
                    : "var(--status-good)",
              }}
            >
              {formatNumber(snapshot.connectors.outOfService)}
            </span>
            <span
              className="section-title"
              style={{ display: "block", marginTop: 18, color: "var(--text-primary)" }}
            >
              conectores fuera de servicio
            </span>
          </h1>
          <p className="support-text" style={{ marginTop: 12 }}>
            {formatPercent(outOfServiceRatio)} de {formatNumber(fleet)} conectores de la red pública
            de UTE.
          </p>
        </div>
      </section>

      <section className="band">
        <div className="container">
          <h2 className="visually-hidden">
            Estado actual de los conectores, según lo último que publicó UTE
          </h2>
          <HealthBar
            segments={[
              { health: "operational", count: snapshot.connectors.operational },
              { health: "faulted", count: snapshot.connectors.faulted },
              { health: "unknown", count: snapshot.connectors.unknown },
              { health: "absent", count: snapshot.connectors.absent },
            ]}
          />
        </div>
      </section>

      <section className="band band-tinted">
        <div className="container">
          <h2 className="section-title">
            {formatNumber(snapshot.stations.total)} estaciones en todo el país
          </h2>
          <p className="support-text" style={{ marginTop: 12, marginBottom: 32 }}>
            {formatNumber(snapshot.stations.listed)} en el feed ·{" "}
            {formatNumber(snapshot.stations.silent)} sin telemetría ·{" "}
            {formatNumber(snapshot.stations.delisted)} fuera.
          </p>
          <StationMapPanel stations={stations} />
          <StationList stations={stations} />
        </div>
      </section>

      <section className="band">
        <div className="container">
          <div className="figure-row">
            <Figure
              label="Conectores reportados"
              value={formatNumber(snapshot.connectors.reported)}
              note={`${formatNumber(snapshot.connectors.operational)} en servicio`}
            />
            <Figure
              label="Estaciones"
              value={formatNumber(snapshot.stations.total)}
              note={`${formatNumber(snapshot.stations.listed)} en el feed`}
            />
            <Figure
              label="Última lectura"
              value={formatElapsed(snapshot.lastSuccessfulPollAt)}
              note={formatDateTime(snapshot.lastSuccessfulPollAt)}
            />
          </div>
        </div>
      </section>

      <section className="band band-tinted">
        <div className="container">
          <h2 className="section-title">{lastDaysHeading(historyCovers)}</h2>
          <p className="support-text" style={{ marginTop: 12, marginBottom: 32 }}>
            Promedio diario de conectores fuera de servicio, ponderado por el tiempo que pasaron en
            cada estado.
          </p>
          <HistoryChart series={history} />
        </div>
      </section>

      <section className="band">
        <div className="container">
          <h2 className="section-title">Estaciones con peor disponibilidad</h2>
          <p className="support-text" style={{ marginTop: 12, marginBottom: 32 }}>
            {lastDaysSentence(reliabilityCovers)}, ponderado por cantidad de conectores y duración
            de la caída.
          </p>
          <ReliabilityTable stations={reliability} />
        </div>
      </section>

      <section className="band band-tinted">
        <div className="container">
          <h2 className="section-title">Capacidad por departamento</h2>
          <div style={{ marginTop: 32 }}>
            <DepartmentChart departments={departments} />
          </div>
        </div>
      </section>

      <section className="band">
        <div className="container">
          <h2 className="section-title">Fiabilidad del feed</h2>
          <p className="support-text" style={{ marginTop: 12, marginBottom: 32 }}>
            Salud de la fuente de datos, no de los cargadores.
          </p>
          <FeedStats feed={feed} />
        </div>
      </section>
    </>
  );
}

function Figure({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div>
      <span className="label-caps">{label}</span>
      <span className="figure-major" style={{ marginTop: 10 }}>
        {value}
      </span>
      <span
        style={{
          display: "block",
          marginTop: 10,
          fontSize: 13.5,
          color: "var(--text-muted)",
          lineHeight: 1.45,
        }}
      >
        {note}
      </span>
    </div>
  );
}

function FeedWarning({ feed }: { feed: { identicalPayloadStreak: number; unchangedSince: string | null } }) {
  if (feed.identicalPayloadStreak < 3 || !feed.unchangedSince) return null;

  return (
    <aside
      style={{
        borderBottom: "1px solid var(--status-warning)",
        background: "color-mix(in srgb, var(--status-warning) 10%, var(--surface-1))",
      }}
    >
      <div className="container" style={{ paddingTop: 16, paddingBottom: 16, fontSize: 13.5, lineHeight: 1.55 }}>
        <strong style={{ display: "block", marginBottom: 4 }}>
          ⚠ UTE viene publicando exactamente los mismos datos
        </strong>
        Las últimas {formatNumber(feed.identicalPayloadStreak)} lecturas devolvieron una respuesta
        byte a byte idéntica, desde el {formatDateTime(feed.unchangedSince)}. Mientras esto siga
        así, los estados publicados no reflejan la situación real de los cargadores y las métricas
        de falla de abajo van a subestimar el problema.
      </div>
    </aside>
  );
}

function FeedStats({
  feed,
}: {
  feed: {
    windowDays: number;
    polls: number;
    successes: number;
    failures: number;
    successRate: number;
    distinctPayloads: number;
    identicalPayloadStreak: number;
    lastFailureAt: string | null;
  };
}) {
  const rows = [
    { label: `Lecturas (${feed.windowDays} días)`, value: formatNumber(feed.polls) },
    { label: "Tasa de éxito", value: formatPercent(feed.successRate) },
    { label: "Lecturas fallidas", value: formatNumber(feed.failures) },
    { label: "Respuestas distintas", value: formatNumber(feed.distinctPayloads) },
    { label: "Racha sin cambios", value: formatNumber(feed.identicalPayloadStreak) },
    {
      label: "Última falla",
      value: feed.lastFailureAt ? formatDateTime(feed.lastFailureAt) : "ninguna",
    },
  ];

  return (
    <dl className="hairline-list" style={{ margin: 0 }}>
      {rows.map((row) => (
        <div
          key={row.label}
          className="row-wash"
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 16,
            fontSize: 14.5,
            padding: "14px 0",
          }}
        >
          <dt style={{ color: "var(--text-secondary)" }}>{row.label}</dt>
          <dd
            style={{
              margin: 0,
              fontWeight: 600,
              fontVariantNumeric: "tabular-nums",
              textAlign: "right",
            }}
          >
            {row.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="container" style={{ paddingTop: 58, paddingBottom: 58 }}>
      <h1 className="section-title">{title}</h1>
      <p className="support-text" style={{ marginTop: 12, maxWidth: 640 }}>
        {children}
      </p>
    </div>
  );
}
