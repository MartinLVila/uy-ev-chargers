import { connectorHealth } from "@/lib/ui/health";
import { formatNumber, formatPercent } from "@/lib/ui/format";

export interface HealthSegment {
  health: string;
  count: number;
}

interface HealthBarProps {
  segments: HealthSegment[];
}

export function HealthBar({ segments }: HealthBarProps) {
  const present = segments.filter((segment) => segment.count > 0);
  const total = present.reduce((sum, segment) => sum + segment.count, 0);

  if (total === 0) {
    return (
      <p style={{ margin: 0, fontSize: 15, color: "var(--text-muted)" }}>
        Todavía no hay conectores registrados.
      </p>
    );
  }

  return (
    <div>
      <div aria-hidden style={{ display: "flex", gap: 2, height: 6 }}>
        {present.map((segment) => {
          const presentation = connectorHealth(segment.health);
          return (
            <div
              key={segment.health}
              title={`${presentation.label}: ${formatNumber(segment.count)}`}
              style={{
                flexGrow: segment.count,
                flexBasis: 0,
                backgroundColor: presentation.color,
                backgroundImage: presentation.pattern,
              }}
            />
          );
        })}
      </div>

      <ul
        style={{
          listStyle: "none",
          margin: "36px 0 0",
          padding: 0,
          display: "grid",
          gridTemplateColumns: `repeat(auto-fit, minmax(200px, 1fr))`,
          gap: 32,
        }}
      >
        {present.map((segment) => {
          const presentation = connectorHealth(segment.health);
          return (
            <li key={segment.health} style={{ minWidth: 0 }}>
              <span
                className="label-caps"
                style={{ display: "flex", alignItems: "center", gap: 8 }}
              >
                <span aria-hidden style={{ color: presentation.color, fontSize: 13 }}>
                  {presentation.symbol}
                </span>
                {presentation.label}
              </span>
              <span className="figure-major" style={{ marginTop: 10 }}>
                {formatNumber(segment.count)}
              </span>
              <span
                style={{
                  display: "block",
                  marginTop: 8,
                  fontSize: 13.5,
                  color: "var(--text-muted)",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {formatPercent(segment.count / total)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
