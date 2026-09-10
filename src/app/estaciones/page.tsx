import { StationsIndex } from "@/components/StationsIndex";
import { loadStationList } from "@/lib/metrics/station-list";
import { formatNumber } from "@/lib/ui/format";

export const revalidate = 60;

export default async function StationsPage() {
  const stations = await loadStationList();

  if (stations.length === 0) {
    return (
      <div className="container" style={{ paddingTop: 58, paddingBottom: 58 }}>
        <h1 className="section-title">Toda la red</h1>
        <p className="support-text" style={{ marginTop: 12 }}>
          No hay datos para mostrar en este momento. Volvé a intentar más tarde.
        </p>
      </div>
    );
  }

  return (
    <section className="band">
      <div className="container no-scroll-entrance">
        <h1 className="section-title">Toda la red</h1>
        <p className="support-text" style={{ marginTop: 12, marginBottom: 32 }}>
          Las {formatNumber(stations.length)} estaciones de la red pública de UTE, ordenadas por
          departamento.
        </p>

        <StationsIndex stations={stations} />
      </div>
    </section>
  );
}
