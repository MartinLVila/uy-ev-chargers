import type { DepartmentBreakdown } from "@/lib/metrics/queries";
import { Th } from "@/components/TableHeading";
import { formatNumber } from "@/lib/ui/format";

interface DepartmentChartProps {
  departments: DepartmentBreakdown[];
}

const MIN_BAR_PERCENT = 1.5;

function fleetOf(row: DepartmentBreakdown): number {
  return row.connectors + row.absent;
}

export function DepartmentChart({ departments }: DepartmentChartProps) {
  const rows = departments.filter((row) => fleetOf(row) > 0);

  if (rows.length === 0) {
    return (
      <p style={{ margin: 0, fontSize: 15, color: "var(--text-muted)" }}>
        Todavía no hay datos por departamento.
      </p>
    );
  }

  const largest = rows.reduce((biggest, row) => (fleetOf(row) > fleetOf(biggest) ? row : biggest));
  const maxFleet = fleetOf(largest);

  return (
    <div style={{ overflowX: "auto" }}>
      <p className="support-text" style={{ marginTop: 0, marginBottom: 16, fontSize: 12.5 }}>
        Barras a escala de {largest.department}, el departamento con más conectores (
        {formatNumber(maxFleet)}). Un departamento a la mitad de la barra tiene la mitad de su
        capacidad, no la mitad de sus conectores en servicio.
      </p>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14.5, minWidth: 340 }}>
        <caption className="visually-hidden">
          Una fila por departamento, con su capacidad instalada a escala de {largest.department} y
          cuántos conectores tiene fuera de servicio
        </caption>
        <thead>
          <tr>
            <Th align="left">Departamento</Th>
            <Th align="left">Capacidad</Th>
            <Th align="right">Conectores</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const fleet = fleetOf(row);
            const working = fleet - row.outOfService;
            const fleetPercent = (fleet / maxFleet) * 100;
            const scale = fleetPercent > 0 && fleetPercent < MIN_BAR_PERCENT ? MIN_BAR_PERCENT / fleetPercent : 1;
            const workingPercent = (working / maxFleet) * 100 * scale;
            const badPercent = (row.outOfService / maxFleet) * 100 * scale;

            return (
              <tr key={row.department} className="row-wash" style={{ borderTop: "1px solid var(--border)" }}>
                <th scope="row" style={{ padding: "10px 12px 10px 0", textAlign: "left", fontWeight: 400 }}>
                  {row.department}
                </th>
                <td style={{ padding: "10px 12px 10px 0" }}>
                  <span
                    style={{
                      display: "flex",
                      height: 14,
                      borderRadius: 3,
                      background: "var(--surface-2)",
                      overflow: "hidden",
                    }}
                  >
                    <span
                      className="department-bar-fill"
                      style={{
                        width: `${workingPercent}%`,
                        background: "var(--status-good)",
                        opacity: 0.75,
                      }}
                    />
                    {row.outOfService > 0 && (
                      <span
                        className="department-bar-fill"
                        style={{ width: `${badPercent}%`, background: "var(--status-critical)" }}
                      />
                    )}
                  </span>
                </td>
                <td
                  style={{
                    padding: "10px 0",
                    textAlign: "right",
                    fontVariantNumeric: "tabular-nums",
                    fontWeight: 600,
                  }}
                >
                  {formatNumber(fleet)}
                  {row.outOfService > 0 && (
                    <span style={{ color: "var(--status-critical)", fontWeight: 600 }}>
                      {" "}
                      <span aria-hidden>−{formatNumber(row.outOfService)}</span>
                      <span className="visually-hidden">
                        , {formatNumber(row.outOfService)} fuera de servicio
                      </span>
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
