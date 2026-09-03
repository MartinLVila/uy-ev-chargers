import { formatDateTime, formatNumber } from "@/lib/ui/format";
import {
  buildConnectorTimelines,
  resolveTimelineRange,
  type ConnectorGroupTimeline,
  type ConnectorLane,
  type LaneSlice,
} from "@/lib/ui/connector-timeline";
import { USAGE_PRESENTATION, type ConnectorUsage } from "@/lib/ui/health";
import type { StationTimelineEntry } from "@/lib/metrics/queries";

const LEGEND: ConnectorUsage[] = ["free", "inUse", "broken", "absent", "unknown"];

const ONE_BAR_EACH =
  "El feed informa cuántos conectores de este grupo están en cada estado, no cuál es cuál. Hay una barra por conector y en cada momento las barras suman los estados observados, pero ninguna barra sigue a un cargador en particular a lo largo del tiempo.";

const A_BAR_THAT_DID_NOT_EXIST_YET =
  "Un tramo vacío es un conector que el grupo todavía no tenía en ese momento.";

function percentage(numerator: number, denominator: number): number {
  return denominator > 0 ? Math.round((numerator / denominator) * 100) : 0;
}

interface GroupReading {
  utilization: number;
  outOfService: number;
  interrupted: boolean;
}

function readingOf(group: ConnectorGroupTimeline): GroupReading {
  const active = group.seconds.free + group.seconds.inUse;
  const outage = group.seconds.broken + group.seconds.absent;
  return {
    utilization: percentage(group.seconds.inUse, active),
    outOfService: percentage(outage, active + outage),
    interrupted: outage > 0,
  };
}

function groupName(group: ConnectorGroupTimeline): string {
  const cable = group.hasCable ? "con cable" : "sin cable";
  const bars = group.lanes.length;
  return `${group.connectorType} de ${group.powerKw} kW ${cable}, ${formatNumber(bars)} ${
    bars === 1 ? "conector" : "conectores"
  }`;
}

function groupDescription(group: ConnectorGroupTimeline, reading: GroupReading): string {
  const outage = reading.interrupted
    ? `, y fuera de servicio ${reading.outOfService}% del tiempo con telemetría`
    : ", sin interrupciones registradas";
  const perConnector =
    group.lanes.length === 1 ? "" : ` Una barra por conector. ${ONE_BAR_EACH}`;
  return `Líneas de tiempo de ${groupName(group)}: en uso ${reading.utilization}% del tiempo que estuvo en servicio${outage}.${perConnector} El detalle intervalo por intervalo está en la lista de cambios, al final de la página.`;
}

function sliceTitle(slice: LaneSlice): string {
  return `${USAGE_PRESENTATION[slice.state].label}\n${formatDateTime(
    new Date(slice.from).toISOString(),
  )} → ${formatDateTime(new Date(slice.to).toISOString())}`;
}

function hasEmptyStretch(group: ConnectorGroupTimeline): boolean {
  return group.lanes.some(
    (lane) => lane.slices.reduce((drawn, slice) => drawn + slice.widthPct, 0) < 99.5,
  );
}

function Bar({ lane }: { lane: ConnectorLane }) {
  return (
    <div
      aria-hidden
      style={{
        position: "relative",
        height: 12,
        borderRadius: 999,
        background: "var(--surface-2)",
        overflow: "hidden",
      }}
    >
      {[...lane.slices].reverse().map((slice, index) => (
        <div
          key={`${lane.key}-${index}`}
          title={sliceTitle(slice)}
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: `${slice.leftPct}%`,
            width: `max(2px, ${slice.widthPct}%)`,
            backgroundColor: USAGE_PRESENTATION[slice.state].color,
            backgroundImage: USAGE_PRESENTATION[slice.state].pattern,
          }}
        />
      ))}
    </div>
  );
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
        const reading = readingOf(group);
        const bars = group.lanes.length;

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
                  {group.hasCable ? " · con cable" : " · sin cable"} · {formatNumber(bars)}{" "}
                  {bars === 1 ? "conector" : "conectores"}
                </span>
              </div>
              <div
                style={{
                  fontSize: 12.5,
                  color: "var(--text-secondary)",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                Uso <strong style={{ color: "var(--text-primary)" }}>{reading.utilization}%</strong>
                {reading.outOfService > 0 && (
                  <>
                    {" "}
                    · Fuera de servicio{" "}
                    <strong style={{ color: "var(--status-critical)" }}>
                      {reading.outOfService}%
                    </strong>
                  </>
                )}
              </div>
            </div>

            <div
              role="img"
              aria-label={groupDescription(group, reading)}
              style={{ display: "flex", flexDirection: "column", gap: 4 }}
            >
              {group.lanes.map((lane) => (
                <Bar key={lane.key} lane={lane} />
              ))}
            </div>

            {bars > 1 && (
              <p style={{ margin: 0, fontSize: 12, color: "var(--text-muted)" }}>
                {ONE_BAR_EACH}
                {hasEmptyStretch(group) && ` ${A_BAR_THAT_DID_NOT_EXIST_YET}`}
              </p>
            )}
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
