import type { StationTimelineEntry } from "@/lib/metrics/queries";
import { formatDateTime, formatNumber } from "@/lib/ui/format";
import {
  connectorUsageState,
  USAGE_PRESENTATION,
  type ConnectorUsage,
} from "@/lib/ui/health";

const LEGEND: ConnectorUsage[] = ["free", "inUse", "broken", "absent", "unknown"];

interface Segment {
  leftPct: number;
  widthPct: number;
  state: ConnectorUsage;
  from: string;
  to: string | null;
}

interface ConnectorGroup {
  key: string;
  connectorType: string;
  powerKw: number;
  hasCable: boolean;
  connectorCount: number;
  latestStartedAt: number;
  segments: Segment[];
  seconds: Record<ConnectorUsage, number>;
}

function emptySeconds(): Record<ConnectorUsage, number> {
  return { free: 0, inUse: 0, broken: 0, absent: 0, unknown: 0 };
}

function buildGroups(
  timeline: StationTimelineEntry[],
  rangeStart: number,
  rangeEnd: number,
): ConnectorGroup[] {
  const span = Math.max(rangeEnd - rangeStart, 1);
  const groups = new Map<string, ConnectorGroup>();

  for (const entry of timeline) {
    const key = `${entry.connectorType}|${entry.powerKw}|${entry.hasCable}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        connectorType: entry.connectorType,
        powerKw: entry.powerKw,
        hasCable: entry.hasCable,
        connectorCount: entry.connectorCount,
        latestStartedAt: -Infinity,
        segments: [],
        seconds: emptySeconds(),
      };
      groups.set(key, group);
    }

    const startedAt = new Date(entry.startedAt).getTime();
    const endedAt = entry.endedAt ? new Date(entry.endedAt).getTime() : rangeEnd;
    const start = Math.max(startedAt, rangeStart);
    const end = Math.min(endedAt, rangeEnd);
    if (!(end > start)) continue;

    const state = connectorUsageState(entry.health, entry.statusDetail);
    group.seconds[state] += ((end - start) / 1000) * entry.connectorCount;
    group.segments.push({
      leftPct: ((start - rangeStart) / span) * 100,
      widthPct: ((end - start) / span) * 100,
      state,
      from: entry.startedAt,
      to: entry.endedAt,
    });
    if (startedAt > group.latestStartedAt) {
      group.latestStartedAt = startedAt;
      group.connectorCount = entry.connectorCount;
    }
  }

  return [...groups.values()].sort(
    (a, b) => a.connectorType.localeCompare(b.connectorType) || b.powerKw - a.powerKw,
  );
}

function percentage(numerator: number, denominator: number): number {
  return denominator > 0 ? Math.round((numerator / denominator) * 100) : 0;
}

export function ConnectorHistory({
  timeline,
  firstSeenAt,
  windowStart,
  windowEnd,
}: {
  timeline: StationTimelineEntry[];
  firstSeenAt: string;
  windowStart: string;
  windowEnd: string;
}) {
  const rangeEnd = new Date(windowEnd).getTime();
  const windowStartMs = new Date(windowStart).getTime();
  const firstSeen = new Date(firstSeenAt).getTime();
  const rangeStart = Number.isFinite(firstSeen)
    ? Math.max(windowStartMs, firstSeen)
    : windowStartMs;

  const groups =
    Number.isFinite(rangeStart) && Number.isFinite(rangeEnd)
      ? buildGroups(timeline, rangeStart, rangeEnd)
      : [];

  if (groups.length === 0) {
    return (
      <p style={{ margin: 0, fontSize: 13, color: "var(--text-muted)" }}>
        Todavía no hay historial registrado para este período.
      </p>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 12.5 }}>
        {LEGEND.map((state) => (
          <span key={state} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: 2,
                background: USAGE_PRESENTATION[state].color,
              }}
            />
            <span style={{ color: "var(--text-secondary)" }}>{USAGE_PRESENTATION[state].label}</span>
          </span>
        ))}
      </div>

      {groups.map((group) => {
        const active = group.seconds.free + group.seconds.inUse;
        const tracked = active + group.seconds.broken + group.seconds.absent;
        const utilization = percentage(group.seconds.inUse, active);
        const outOfService = percentage(group.seconds.broken + group.seconds.absent, tracked);

        return (
          <div key={group.key} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                justifyContent: "space-between",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 600 }}>
                {group.connectorType} · {group.powerKw} kW
                <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>
                  {group.hasCable ? " · con cable" : " · sin cable"} ·{" "}
                  {formatNumber(group.connectorCount)}{" "}
                  {group.connectorCount === 1 ? "conector" : "conectores"}
                </span>
              </div>
              <div
                style={{
                  fontSize: 12.5,
                  color: "var(--text-secondary)",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                Uso <strong style={{ color: "var(--text-primary)" }}>{utilization}%</strong>
                {outOfService > 0 && (
                  <>
                    {" "}
                    · Fuera de servicio{" "}
                    <strong style={{ color: "var(--status-critical)" }}>{outOfService}%</strong>
                  </>
                )}
              </div>
            </div>

            <div
              style={{
                position: "relative",
                height: 22,
                borderRadius: 6,
                background: "var(--surface-2)",
                overflow: "hidden",
              }}
            >
              {group.segments.map((segment, index) => (
                <div
                  key={`${group.key}-${index}`}
                  title={`${USAGE_PRESENTATION[segment.state].label} · ${formatDateTime(segment.from)} → ${
                    segment.to ? formatDateTime(segment.to) : "en curso"
                  }`}
                  style={{
                    position: "absolute",
                    top: 0,
                    bottom: 0,
                    left: `${segment.leftPct}%`,
                    width: `max(2px, ${segment.widthPct}%)`,
                    background: USAGE_PRESENTATION[segment.state].color,
                  }}
                />
              ))}
            </div>
          </div>
        );
      })}

      <p style={{ margin: 0, fontSize: 12, color: "var(--text-muted)" }}>
        Ventana: {formatDateTime(new Date(rangeStart).toISOString())} →{" "}
        {formatDateTime(new Date(rangeEnd).toISOString())}.
      </p>
    </div>
  );
}
