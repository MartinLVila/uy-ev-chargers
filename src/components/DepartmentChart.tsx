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
      <p style={{ margin: 0, fontSize: 15, color: "var(--text-muted)" }}>
        Todavía no hay datos por departamento.
      </p>
    );
  }

  return (
    <dl
      className="hairline-list"
      style={{
        margin: 0,
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
        columnGap: 56,
      }}
    >
      {rows.map((row) => (
        <div
          key={row.department}
          className="row-wash"
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            gap: 16,
            padding: "14px 0",
            fontSize: 14.5,
          }}
        >
          <dt style={{ color: "var(--text-secondary)", minWidth: 0 }}>{row.department}</dt>
          <dd
            style={{
              margin: 0,
              fontVariantNumeric: "tabular-nums",
              whiteSpace: "nowrap",
              fontWeight: 600,
            }}
          >
            {formatNumber(fleetOf(row))}
            <span className="visually-hidden"> conectores</span>
            {row.outOfService > 0 && (
              <span style={{ color: "var(--status-critical)" }}>
                {" "}
                <span aria-hidden>−{formatNumber(row.outOfService)}</span>
                <span className="visually-hidden">
                  , {formatNumber(row.outOfService)} fuera de servicio
                </span>
              </span>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}
