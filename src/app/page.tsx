import { Card } from "@/components/Card";
import { DepartmentChart } from "@/components/DepartmentChart";
import { HealthBar } from "@/components/HealthBar";
import { HistoryChart } from "@/components/HistoryChart";
import { ReliabilityTable } from "@/components/ReliabilityTable";
import { StationMapPanel } from "@/components/StationMapPanel";
import { StatTile } from "@/components/StatTile";
import { loadDashboard } from "@/lib/metrics/dashboard";
import { formatDateTime, formatElapsed, formatNumber, formatPercent } from "@/lib/ui/format";

export const revalidate = 60;

export default async function DashboardPage() {
  const data = await loadDashboard();

  if (!data) {
    return (
      <Notice title="Base de datos no disponible">
        No se pudo leer la base. Verificá que <code>DATABASE_URL</code> esté configurada y que las
        migraciones se hayan aplicado con <code>npm run db:migrate</code>.
      </Notice>
    );
  }

  const { snapshot, feed, departments, stations, reliability, history, historyDays } = data;

  if (snapshot.stations.total === 0) {
    return (
      <Notice title="Todavía no hay datos">
        La base está conectada pero vacía. Ejecutá <code>npm run poll</code> para hacer la primera
        lectura del feed de UTE, o esperá a que corra el workflow programado.
      </Notice>
    );
  }

  const fleet = snapshot.connectors.reported + snapshot.connectors.absent;
  const outOfServiceRatio = fleet > 0 ? snapshot.connectors.outOfService / fleet : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <FeedWarning feed={feed} />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(196px, 1fr))",
          gap: 12,
        }}
      >
        <StatTile
          label="Conectores fuera de servicio"
          value={formatNumber(snapshot.connectors.outOfService)}
          note={`${formatPercent(outOfServiceRatio)} de ${formatNumber(fleet)} conectores`}
          accent={
            snapshot.connectors.outOfService > 0 ? "var(--status-critical)" : "var(--status-good)"
          }
          emphasis
        />
        <StatTile
          label="Estaciones"
          value={formatNumber(snapshot.stations.total)}
          note={`${formatNumber(snapshot.stations.listed)} en el feed · ${formatNumber(
            snapshot.stations.silent,
          )} sin telemetría · ${formatNumber(snapshot.stations.delisted)} fuera`}
        />
        <StatTile
          label="Conectores reportados"
          value={formatNumber(snapshot.connectors.reported)}
          note={`${formatNumber(snapshot.connectors.operational)} en servicio`}
        />
        <StatTile
          label="Última lectura"
          value={formatElapsed(snapshot.lastSuccessfulPollAt)}
          note={formatDateTime(snapshot.lastSuccessfulPollAt)}
        />
      </div>

      <Card
        title="Estado actual de los conectores"
        description="Clasificación de cada conector según lo último que publicó UTE."
      >
        <HealthBar
          segments={[
            { health: "operational", count: snapshot.connectors.operational },
            { health: "faulted", count: snapshot.connectors.faulted },
            { health: "unknown", count: snapshot.connectors.unknown },
            { health: "absent", count: snapshot.connectors.absent },
          ]}
        />
      </Card>

      <Card title="Mapa de la red">
        <StationMapPanel stations={stations} />
      </Card>

      <Card
        title={`Historial de los últimos ${historyDays} días`}
        description="Promedio diario de conectores fuera de servicio, ponderado por el tiempo que pasaron en cada estado."
      >
        <HistoryChart series={history} />
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 20 }}>
        <Card title="Capacidad por departamento">
          <DepartmentChart departments={departments} />
        </Card>

        <Card
          title="Fiabilidad del feed"
          description="Salud de la fuente de datos, no de los cargadores."
        >
          <FeedStats feed={feed} />
        </Card>
      </div>

      <Card
        title="Estaciones con peor disponibilidad"
        description="Últimos 30 días, ponderado por cantidad de conectores y duración de la caída."
      >
        <ReliabilityTable stations={reliability} />
      </Card>
    </div>
  );
}

function FeedWarning({ feed }: { feed: { identicalPayloadStreak: number; unchangedSince: string | null } }) {
  if (feed.identicalPayloadStreak < 3 || !feed.unchangedSince) return null;

  return (
    <aside
      style={{
        border: "1px solid var(--status-warning)",
        background: "color-mix(in srgb, var(--status-warning) 10%, var(--surface-1))",
        borderRadius: 12,
        padding: "14px 18px",
        fontSize: 13.5,
        lineHeight: 1.55,
      }}
    >
      <strong style={{ display: "block", marginBottom: 4 }}>
        ⚠ UTE viene publicando exactamente los mismos datos
      </strong>
      Las últimas {formatNumber(feed.identicalPayloadStreak)} lecturas devolvieron una respuesta
      byte a byte idéntica, desde el {formatDateTime(feed.unchangedSince)}. Mientras esto siga así,
      los estados publicados no reflejan la situación real de los cargadores y las métricas de falla
      de abajo van a subestimar el problema.
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
    <dl style={{ margin: 0, display: "flex", flexDirection: "column", gap: 10 }}>
      {rows.map((row) => (
        <div
          key={row.label}
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 16,
            fontSize: 13.5,
            borderBottom: "1px solid var(--border)",
            paddingBottom: 8,
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
    <div
      style={{
        background: "var(--surface-1)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        padding: 24,
        maxWidth: 640,
      }}
    >
      <h1 style={{ margin: "0 0 8px", fontSize: 18, fontWeight: 600 }}>{title}</h1>
      <p style={{ margin: 0, fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.6 }}>
        {children}
      </p>
    </div>
  );
}
