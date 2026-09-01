import { formatDateTime, formatNumber } from "@/lib/ui/format";
import {
  buildConnectorTimelines,
  resolveTimelineRange,
  type ConnectorGroupTimeline,
  type TimelineSlice,
} from "@/lib/ui/connector-timeline";
import { USAGE_PRESENTATION, type ConnectorUsage } from "@/lib/ui/health";
import type { StationTimelineEntry } from "@/lib/metrics/queries";

const LEGEND: ConnectorUsage[] = ["free", "inUse", "broken", "absent", "unknown"];

function percentage(numerator: number, denominator: number): number {
  return denominator > 0 ? Math.round((numerator / denominator) * 100) : 0;
}

function groupName(group: ConnectorGroupTimeline): string {
  const cable = group.hasCable ? "con cable" : "sin cable";
  return `${group.connectorType} de ${group.powerKw} kW ${cable}, ${formatNumber(
    group.connectors,
  )} ${group.connectors === 1 ? "conector" : "conectores"}`;
}

function barDescription(
  group: ConnectorGroupTimeline,
  utilization: number,
  outOfService: number,
): string {
  const outageSeconds = group.seconds.broken + group.seconds.absent;
  const outage =
    outageSeconds === 0
      ? ", sin interrupciones registradas"
      : `, y fuera de servicio ${outOfService}% del tiempo con telemetría`;
  return `Línea de tiempo de ${groupName(group)}: en uso ${utilization}% del tiempo que estuvo en servicio${outage}. El detalle intervalo por intervalo está en la tabla Historial de estados.`;
}

function sliceTitle(slice: TimelineSlice): string {
  const mix = slice.bands
    .map((band) => `${formatNumber(band.connectors)} ${USAGE_PRESENTATION[band.state].label}`)
    .join(" · ");
  return `${mix}\n${formatDateTime(new Date(slice.from).toISOString())} → ${formatDateTime(
    new Date(slice.to).toISOString(),
  )}`;
}

export function ConnectorHistory({
  timeline,
  timelineCoversFrom,
  firstSeenAt,
  windowStart,
  windowEnd,
}: {
  timeline: StationTimelineEntry[];
  timelineCoversFrom: string | null;
  firstSeenAt: string;
  windowStart: string;
  windowEnd: string;
}) {
  const range = resolveTimelineRange(timelineCoversFrom, firstSeenAt, windowStart, windowEnd);

  const groups = range ? buildConnectorTimelines(timeline, range.start, range.end) : [];

  if (!range || groups.length === 0) {
    return (
      <p style={{ margin: 0, fontSize: 13, color: "var(--text-muted)" }}>
        Todavía no hay historial registrado para este período.
      </p>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
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
                  {formatNumber(group.connectors)}{" "}
                  {group.connectors === 1 ? "conector" : "conectores"}
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
              role="img"
              aria-label={barDescription(group, utilization, outOfService)}
              style={{
                position: "relative",
                height: 12,
                borderRadius: 999,
                background: "var(--surface-2)",
                overflow: "hidden",
              }}
            >
              {group.slices.map((slice, index) => (
                <div
                  aria-hidden
                  key={`${group.key}-${index}`}
                  title={sliceTitle(slice)}
                  style={{
                    position: "absolute",
                    top: 0,
                    bottom: 0,
                    left: `${slice.leftPct}%`,
                    width: `max(2px, ${slice.widthPct}%)`,
                    display: "flex",
                    flexDirection: "column",
                  }}
                >
                  {slice.bands.map((band) => (
                    <div
                      key={band.state}
                      style={{
                        height: `${band.sharePct}%`,
                        backgroundColor: USAGE_PRESENTATION[band.state].color,
                        backgroundImage: USAGE_PRESENTATION[band.state].pattern,
                      }}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        );
      })}

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 12.5 }}>
        {LEGEND.map((state) => (
          <span key={state} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span
              aria-hidden
              style={{
                width: 12,
                height: 12,
                borderRadius: 2,
                backgroundColor: USAGE_PRESENTATION[state].color,
                backgroundImage: USAGE_PRESENTATION[state].pattern,
              }}
            />
            <span aria-hidden style={{ color: USAGE_PRESENTATION[state].color, fontSize: 11 }}>
              {USAGE_PRESENTATION[state].symbol}
            </span>
            <span style={{ color: "var(--text-secondary)" }}>{USAGE_PRESENTATION[state].label}</span>
          </span>
        ))}
      </div>

      <p style={{ margin: 0, fontSize: 12, color: "var(--text-muted)" }}>
        Ventana: {formatDateTime(new Date(range.start).toISOString())} →{" "}
        {formatDateTime(new Date(range.end).toISOString())}.
        {range.clampedByRowLimit && (
          <>
            {" "}
            Recortada por el límite de registros: los cambios anteriores a esa fecha no se
            cargaron, y los porcentajes describen solo el tramo dibujado.
          </>
        )}
      </p>
    </div>
  );
}
