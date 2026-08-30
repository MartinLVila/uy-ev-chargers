import type { DepartmentBreakdown } from "@/lib/metrics/queries";
import { formatNumber } from "@/lib/ui/format";

interface DepartmentChartProps {
  departments: DepartmentBreakdown[];
}

export function DepartmentChart({ departments }: DepartmentChartProps) {
  const fleetOf = (row: DepartmentBreakdown) => row.connectors + row.absent;
  const rows = departments.filter((row) => fleetOf(row) > 0);

  if (rows.length === 0) {
    return (
      <p style={{ margin: 0, fontSize: 13, color: "var(--text-muted)" }}>
        Todavía no hay datos por departamento.
      </p>
    );
  }

  const max = Math.max(...rows.map(fleetOf));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {rows.map((row) => {
        const total = fleetOf(row);
        const inService = row.operational;
        const widthPercent = (total / max) * 100;
        const brokenShare = total > 0 ? row.outOfService / total : 0;

        return (
          <div
            key={row.department}
            style={{ display: "grid", gridTemplateColumns: "132px 1fr auto", gap: 12, alignItems: "center" }}
          >
            <span
              style={{
                fontSize: 13,
                color: "var(--text-secondary)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
              title={row.department}
            >
              {row.department}
            </span>

            <div
              aria-hidden
              style={{ display: "flex", width: `${widthPercent}%`, gap: 2, height: 14, minWidth: 4 }}
            >
              {inService > 0 && (
                <div
                  title={`En servicio: ${formatNumber(inService)}`}
                  style={{
                    flexGrow: inService,
                    flexBasis: 0,
                    background: "var(--accent)",
                    borderRadius: brokenShare > 0 ? "4px 0 0 4px" : 4,
                  }}
                />
              )}
              {row.outOfService > 0 && (
                <div
                  title={`Fuera de servicio: ${formatNumber(row.outOfService)}`}
                  style={{
                    flexGrow: row.outOfService,
                    flexBasis: 0,
                    backgroundColor: "var(--status-critical)",
                    backgroundImage:
                      "repeating-linear-gradient(-45deg, transparent 0 2px, rgb(255 255 255 / 0.6) 2px 5px)",
                    borderRadius: inService > 0 ? "0 4px 4px 0" : 4,
                  }}
                />
              )}
            </div>

            <span
              style={{
                fontSize: 13,
                fontVariantNumeric: "tabular-nums",
                color: "var(--text-secondary)",
                whiteSpace: "nowrap",
              }}
            >
              {formatNumber(total)}
              <span className="visually-hidden"> conectores</span>
              {row.outOfService > 0 && (
                <span style={{ color: "var(--status-critical)", fontWeight: 600 }}>
                  {" "}
                  <span aria-hidden>−{formatNumber(row.outOfService)}</span>
                  <span className="visually-hidden">
                    , {formatNumber(row.outOfService)} fuera de servicio
                  </span>
                </span>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}
