import { formatDateTime, formatNumber } from "@/lib/ui/format";
import {
  buildConnectorTimelines,
  isOutOfService,
  resolveTimelineRange,
  type ConnectorGroupTimeline,
  type ConnectorLane,
  type DayCell,
} from "@/lib/ui/connector-timeline";
import { USAGE_PRESENTATION, type ConnectorUsage } from "@/lib/ui/health";
import type { StationTimelineEntry } from "@/lib/metrics/queries";

const MONTHS = [
  "ene",
  "feb",
  "mar",
  "abr",
  "may",
  "jun",
  "jul",
  "ago",
  "set",
  "oct",
  "nov",
  "dic",
];

const LEGEND: ConnectorUsage[] = ["free", "inUse", "broken", "absent", "unknown"];

const DAY_FILL: Record<ConnectorUsage, string> = {
  free: "var(--day-free)",
  inUse: "var(--day-in-use)",
  broken: "var(--day-out)",
  absent: "var(--day-absent)",
  unknown: "var(--day-unknown)",
};

const ONE_ROW_EACH =
  "El feed informa cuántos conectores de este grupo están en cada estado, no cuál es cuál. Hay una fila por conector y en cada momento las filas suman los estados observados, pero ninguna fila sigue a un cargador en particular a lo largo del tiempo.";

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
  const rows = group.lanes.length;
  return `${group.connectorType} de ${group.powerKw} kW ${cable}, ${formatNumber(rows)} ${
    rows === 1 ? "conector" : "conectores"
  }`;
}

function daysOutOfService(group: ConnectorGroupTimeline): number {
  const affected = new Set<number>();

  for (const lane of group.lanes) {
    for (const day of lane.days) {
      if (isOutOfService(day.state) || day.partlyOutOfService) affected.add(day.from);
    }
  }

  return affected.size;
}

function outageWording(days: number): string {
  return days === 1 ? "día fuera de servicio" : "días fuera de servicio";
}

function groupDescription(group: ConnectorGroupTimeline, reading: GroupReading): string {
  const days = daysOutOfService(group);
  const outage = reading.interrupted
    ? `, y fuera de servicio ${reading.outOfService}% del tiempo con telemetría, en ${formatNumber(days)} ${outageWording(days)}`
    : ", sin interrupciones registradas";
  const perConnector = group.lanes.length === 1 ? "" : ` Una fila por conector. ${ONE_ROW_EACH}`;
  return `Calendario de ${groupName(group)}: un día por celda, en uso ${reading.utilization}% del tiempo que estuvo en servicio${outage}.${perConnector} El detalle intervalo por intervalo está en la lista de cambios, al final de la página.`;
}

function dayTitle(day: DayCell): string {
  const date = `${formatNumber(day.dayOfMonth)} ${MONTHS[day.month - 1]}`;
  if (day.state === null) return `${date}: sin datos`;

  const notes = [
    day.partlyOutOfService ? "parte del día fuera de servicio" : "",
    day.thinlyObserved ? "poco observado" : "",
  ].filter(Boolean);

  const label = USAGE_PRESENTATION[day.state].label.toLowerCase();
  return notes.length === 0 ? `${date}: ${label}` : `${date}: ${label}, ${notes.join(", ")}`;
}

function Day({ day }: { day: DayCell }) {
  const presentation = day.state === null ? null : USAGE_PRESENTATION[day.state];

  return (
    <div
      title={dayTitle(day)}
      style={{
        flex: "1 1 0",
        minWidth: 4,
        height: 16,
        borderRadius: 2,
        opacity: day.thinlyObserved ? 0.45 : 1,
        background: day.state === null ? "transparent" : DAY_FILL[day.state],
        backgroundImage: presentation?.pattern,
        boxShadow: presentation ? undefined : "inset 0 0 0 1px var(--text-muted)",
        borderBottom: day.partlyOutOfService ? "3px solid var(--day-out)" : undefined,
      }}
    />
  );
}

function Row({ lane }: { lane: ConnectorLane }) {
  return (
    <div aria-hidden style={{ display: "flex", gap: 1 }}>
      {lane.days.map((day) => (
        <Day key={day.from} day={day} />
      ))}
    </div>
  );
}

function MonthScale({ days }: { days: DayCell[] }) {
  return (
    <div aria-hidden style={{ display: "flex", gap: 1, marginTop: 2 }}>
      {days.map((day, index) => (
        <div
          key={day.from}
          style={{
            flex: "1 1 0",
            minWidth: 4,
            fontSize: 10.5,
            color: "var(--text-muted)",
            whiteSpace: "nowrap",
          }}
        >
          {index === 0 || day.dayOfMonth === 1 ? MONTHS[day.month - 1] : ""}
        </div>
      ))}
    </div>
  );
}

function Swatch({ fill, pattern }: { fill: string; pattern?: string }) {
  return (
    <span
      aria-hidden
      style={{
        width: 14,
        height: 14,
        borderRadius: 2,
        background: fill,
        backgroundImage: pattern,
      }}
    />
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
    <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
      {groups.map((group) => {
        const reading = readingOf(group);
        const rows = group.lanes.length;
        const outageDays = daysOutOfService(group);

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
                  {group.hasCable ? " · con cable" : " · sin cable"} · {formatNumber(rows)}{" "}
                  {rows === 1 ? "conector" : "conectores"}
                </span>
              </div>
              <div
                style={{
                  fontSize: 12.5,
                  color: "var(--text-secondary)",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {outageDays === 0 ? (
                  <>Sin días fuera de servicio</>
                ) : (
                  <>
                    <strong style={{ color: "var(--status-critical)" }}>
                      {formatNumber(outageDays)}
                    </strong>{" "}
                    {outageWording(outageDays)}
                  </>
                )}{" "}
                · Uso <strong style={{ color: "var(--text-primary)" }}>{reading.utilization}%</strong>
              </div>
            </div>

            <div style={{ overflowX: "auto" }}>
              <div
                role="img"
                aria-label={groupDescription(group, reading)}
                style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 320 }}
              >
                {group.lanes.map((lane) => (
                  <Row key={lane.key} lane={lane} />
                ))}
                <MonthScale days={group.lanes[0].days} />
              </div>
            </div>

            {rows > 1 && (
              <p style={{ margin: 0, fontSize: 12, color: "var(--text-muted)" }}>{ONE_ROW_EACH}</p>
            )}
          </div>
        );
      })}

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 12.5 }}>
        {LEGEND.map((state) => (
          <span key={state} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Swatch fill={DAY_FILL[state]} pattern={USAGE_PRESENTATION[state].pattern} />
            <span style={{ color: "var(--text-secondary)" }}>{USAGE_PRESENTATION[state].label}</span>
          </span>
        ))}
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span
            aria-hidden
            style={{
              width: 14,
              height: 14,
              borderRadius: 2,
              boxShadow: "inset 0 0 0 1px var(--text-muted)",
            }}
          />
          <span style={{ color: "var(--text-secondary)" }}>Sin datos</span>
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span
            aria-hidden
            style={{
              width: 14,
              height: 14,
              borderRadius: 2,
              background: "var(--day-free)",
              borderBottom: "3px solid var(--day-out)",
            }}
          />
          <span style={{ color: "var(--text-secondary)" }}>
            Con parte del día fuera de servicio
          </span>
        </span>
      </div>

      <p style={{ margin: 0, fontSize: 12, color: "var(--text-muted)" }}>
        Cada celda es un día en horario de Montevideo, pintado con el estado que más duró ese día.
        Un día apenas observado se dibuja atenuado. Ventana:{" "}
        {formatDateTime(new Date(range.start).toISOString())} →{" "}
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
