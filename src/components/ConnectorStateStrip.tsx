import { connectorHealth } from "@/lib/ui/health";
import { formatNumber, formatPercent } from "@/lib/ui/format";

export interface HealthSegment {
  health: string;
  count: number;
}

interface ConnectorStateStripProps {
  segments: HealthSegment[];
}

export const NARROWEST_VISIBLE_FILL = 3;

export function ConnectorStateStrip({ segments }: ConnectorStateStripProps) {
  const total = segments.reduce((sum, segment) => sum + segment.count, 0);

  if (total === 0) {
    return (
      <p style={{ margin: 0, fontSize: 15, color: "var(--text-muted)" }}>
        Todavía no hay conectores registrados.
      </p>
    );
  }

  return (
    <ul role="list" className="strip">
      {segments.map((segment) => {
        const presentation = connectorHealth(segment.health);
        const share = segment.count / total;

        return (
          <li key={segment.health} className="strip-cell">
            <span className="strip-glyph-row">
              <span aria-hidden style={{ color: presentation.color }}>
                {presentation.symbol}
              </span>
              {presentation.label}
            </span>
            <span className="strip-count">{formatNumber(segment.count)}</span>
            <span className="strip-share">{formatPercent(share)}</span>
            <span className="strip-bar-track" aria-hidden="true">
              <span
                className="strip-bar-fill"
                style={{
                  width: `${share * 100}%`,
                  minWidth: segment.count > 0 ? NARROWEST_VISIBLE_FILL : 0,
                  backgroundColor: presentation.color,
                }}
              />
            </span>
          </li>
        );
      })}
    </ul>
  );
}
