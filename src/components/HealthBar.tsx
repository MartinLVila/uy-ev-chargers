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
      <p style={{ margin: 0, fontSize: 13, color: "var(--text-muted)" }}>
        Todavía no hay conectores registrados.
      </p>
    );
  }

  return (
    <div>
      <div aria-hidden style={{ display: "flex", gap: 2, height: 14, marginBottom: 14 }}>
        {present.map((segment, index) => {
          const presentation = connectorHealth(segment.health);
          const isFirst = index === 0;
          const isLast = index === present.length - 1;
          return (
            <div
              key={segment.health}
              title={`${presentation.label}: ${formatNumber(segment.count)}`}
              style={{
                flexGrow: segment.count,
                flexBasis: 0,
                backgroundColor: presentation.color,
                backgroundImage: presentation.pattern,
                borderTopLeftRadius: isFirst ? 4 : 0,
                borderBottomLeftRadius: isFirst ? 4 : 0,
                borderTopRightRadius: isLast ? 4 : 0,
                borderBottomRightRadius: isLast ? 4 : 0,
              }}
            />
          );
        })}
      </div>

      <ul
        style={{
          listStyle: "none",
          margin: 0,
          padding: 0,
          display: "flex",
          flexWrap: "wrap",
          gap: "8px 20px",
        }}
      >
        {present.map((segment) => {
          const presentation = connectorHealth(segment.health);
          return (
            <li
              key={segment.health}
              style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}
            >
              <span
                aria-hidden
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 3,
                  backgroundColor: presentation.color,
                  backgroundImage: presentation.pattern,
                  flexShrink: 0,
                }}
              />
              <span aria-hidden style={{ color: presentation.color, fontSize: 11 }}>
                {presentation.symbol}
              </span>
              <span style={{ color: "var(--text-secondary)" }}>{presentation.label}</span>
              <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>
                {formatNumber(segment.count)}
              </span>
              <span style={{ color: "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}>
                {formatPercent(segment.count / total)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
