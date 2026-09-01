import type { ConnectorGroupHourlyUsage } from "@/lib/metrics/queries";
import { formatNumber, formatPercent } from "@/lib/ui/format";
import { USAGE_PRESENTATION } from "@/lib/ui/health";
import {
  buildUsageProfiles,
  describeUsageHour,
  describeUsageProfile,
  formatObservedHours,
  hourLabel,
  hourRangeLabel,
  usageProfileName,
  type ConnectorGroupUsageProfile,
  type UsageHour,
} from "@/lib/ui/hourly-usage";

const BAR_HEIGHT = 72;
const OUT_OF_SERVICE_HEIGHT = 9;
const AXIS_WIDTH = 30;
const TICK_EVERY_HOURS = 3;

const IN_USE = USAGE_PRESENTATION.inUse;
const BROKEN = USAGE_PRESENTATION.broken;

const COVERAGE_GLYPH: Record<UsageHour["coverage"], string> = {
  observed: "",
  sparse: "~",
  unobserved: "–",
};

export function ConnectorUsageProfile({ groups }: { groups: ConnectorGroupHourlyUsage[] }) {
  const profiles = buildUsageProfiles(groups);

  if (profiles.length === 0) {
    return (
      <p style={{ margin: 0, fontSize: 13, color: "var(--text-muted)" }}>
        Todavía no hay observaciones suficientes para dibujar el uso por hora.
      </p>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <Legend />
      {profiles.map((profile, index) => (
        <div
          key={profile.connectorGroupId}
          style={
            index === 0
              ? undefined
              : { borderTop: "1px solid var(--border)", paddingTop: 44, marginTop: 22 }
          }
        >
          <GroupChart profile={profile} />
        </div>
      ))}
      <p style={{ margin: 0, fontSize: 12, color: "var(--text-muted)" }}>
        Cada barra es la proporción del tiempo en que ese conector estuvo ocupado durante esa hora
        del día, en horario de Montevideo. Todos los grupos usan la misma escala de 0 a 100%.
      </p>
    </div>
  );
}

function Legend() {
  return (
    <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 12.5 }}>
      <LegendItem color={IN_USE.color} pattern={IN_USE.pattern} label="En uso" />
      <LegendItem color={BROKEN.color} pattern={BROKEN.pattern} label="Fuera de servicio" />
      <LegendItem glyph={COVERAGE_GLYPH.sparse} label="Pocas observaciones" />
      <LegendItem glyph={COVERAGE_GLYPH.unobserved} label="Sin datos" />
    </div>
  );
}

function LegendItem({
  color,
  pattern,
  glyph,
  label,
}: {
  color?: string;
  pattern?: string;
  glyph?: string;
  label: string;
}) {
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
      {glyph === undefined ? (
        <span
          aria-hidden
          style={{
            width: 12,
            height: 12,
            borderRadius: 2,
            backgroundColor: color,
            backgroundImage: pattern,
          }}
        />
      ) : (
        <span
          aria-hidden
          style={{
            width: 12,
            height: 12,
            borderRadius: 2,
            border: "1px dashed var(--border-strong)",
            fontSize: 10,
            lineHeight: "10px",
            textAlign: "center",
            color: "var(--text-muted)",
          }}
        >
          {glyph}
        </span>
      )}
      <span style={{ color: "var(--text-secondary)" }}>{label}</span>
    </span>
  );
}

function GroupChart({ profile }: { profile: ConnectorGroupUsageProfile }) {
  const showsOutOfService = profile.hoursOutOfService > 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
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
          {profile.connectorType} · {profile.powerKw} kW
          <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>
            {profile.hasCable ? " · con cable" : " · sin cable"}
            {profile.connectorCount !== null && (
              <>
                {" "}
                · {formatNumber(profile.connectorCount)}{" "}
                {profile.connectorCount === 1 ? "conector" : "conectores"}
              </>
            )}
          </span>
        </div>
        <div
          style={{
            fontSize: 12.5,
            color: "var(--text-secondary)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {profile.busiest ? (
            <>
              Pico a las{" "}
              <strong style={{ color: "var(--text-primary)" }}>
                {hourLabel(profile.busiest.hour)}
              </strong>{" "}
              con {formatPercent(profile.busiest.utilization ?? 0)}
            </>
          ) : (
            "Sin horas con observación suficiente"
          )}
          <span style={{ color: "var(--text-muted)" }}>
            {" "}
            · {formatNumber(profile.observedDays)}{" "}
            {profile.observedDays === 1 ? "día observado" : "días observados"}
          </span>
        </div>
      </div>

      <div
        role="img"
        aria-label={describeUsageProfile(profile)}
        style={{ display: "flex", gap: 8 }}
      >
        <div
          aria-hidden
          style={{
            width: AXIS_WIDTH,
            height: BAR_HEIGHT,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            textAlign: "right",
            fontSize: 10,
            color: "var(--text-muted)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          <span>100%</span>
          <span>50</span>
          <span>0</span>
        </div>

        <div aria-hidden style={{ flex: 1, minWidth: 0 }}>
          <HourRow>
            {profile.hours.map((entry) => (
              <HourCell key={entry.hour} title={describeUsageHour(profile, entry)}>
                <UsageBar entry={entry} />
                {showsOutOfService && <OutOfServiceBar entry={entry} />}
                <span
                  style={{
                    display: "block",
                    height: 12,
                    lineHeight: "12px",
                    textAlign: "center",
                    fontSize: 10,
                    color: "var(--text-muted)",
                  }}
                >
                  {COVERAGE_GLYPH[entry.coverage]}
                </span>
              </HourCell>
            ))}
          </HourRow>
          <HourRow>
            {profile.hours.map((entry) => (
              <HourCell key={entry.hour}>
                <span
                  style={{
                    display: "block",
                    textAlign: "center",
                    fontSize: 9.5,
                    color: "var(--text-muted)",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {entry.hour % TICK_EVERY_HOURS === 0 ? String(entry.hour).padStart(2, "0") : ""}
                </span>
              </HourCell>
            ))}
          </HourRow>
        </div>
      </div>

      <HourTable profile={profile} />
    </div>
  );
}

function HourRow({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "flex", gap: 2 }}>{children}</div>;
}

function HourCell({ children, title }: { children: React.ReactNode; title?: string }) {
  return (
    <div style={{ flex: "1 1 0", minWidth: 0 }} title={title}>
      {children}
    </div>
  );
}

function UsageBar({ entry }: { entry: UsageHour }) {
  const known = entry.coverage !== "unobserved";

  return (
    <div
      style={{
        position: "relative",
        height: BAR_HEIGHT,
        boxSizing: "border-box",
        borderRadius: 2,
        background: known ? "var(--surface-2)" : "transparent",
        border:
          entry.coverage === "observed"
            ? "1px solid transparent"
            : "1px dashed var(--border-strong)",
        overflow: "hidden",
      }}
    >
      {known && (
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            height: `${(entry.utilization ?? 0) * 100}%`,
            minHeight: (entry.utilization ?? 0) > 0 ? 2 : 0,
            backgroundColor: IN_USE.color,
            backgroundImage: IN_USE.pattern,
            opacity: entry.coverage === "sparse" ? 0.5 : 1,
          }}
        />
      )}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: "50%",
          height: 1,
          background: "var(--border-strong)",
          opacity: 0.7,
        }}
      />
    </div>
  );
}

function OutOfServiceBar({ entry }: { entry: UsageHour }) {
  if (entry.brokenShare === null) {
    return (
      <div
        style={{
          marginTop: 2,
          height: OUT_OF_SERVICE_HEIGHT,
          boxSizing: "border-box",
          borderRadius: 2,
          border: "1px dashed var(--border-strong)",
        }}
      />
    );
  }

  return (
    <div
      style={{
        marginTop: 2,
        height: OUT_OF_SERVICE_HEIGHT,
        borderRadius: 2,
        background: "var(--surface-2)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          height: `${entry.brokenShare * 100}%`,
          minHeight: entry.brokenShare > 0 ? 2 : 0,
          backgroundColor: BROKEN.color,
          backgroundImage: BROKEN.pattern,
        }}
      />
    </div>
  );
}

function HourTable({ profile }: { profile: ConnectorGroupUsageProfile }) {
  return (
    <details style={{ fontSize: 12.5 }}>
      <summary style={{ cursor: "pointer", color: "var(--text-secondary)" }}>
        Ver los valores hora por hora
      </summary>
      <div style={{ overflowX: "auto", marginTop: 8 }}>
        <table style={{ borderCollapse: "collapse", fontSize: 12.5, minWidth: 420 }}>
          <caption style={{ textAlign: "left", paddingBottom: 6, color: "var(--text-muted)" }}>
            {usageProfileName(profile)}
          </caption>
          <thead>
            <tr>
              <HourTableHeading>Hora</HourTableHeading>
              <HourTableHeading align="right">En uso</HourTableHeading>
              <HourTableHeading align="right">Fuera de servicio</HourTableHeading>
              <HourTableHeading align="right">Observación</HourTableHeading>
            </tr>
          </thead>
          <tbody>
            {profile.hours.map((entry) => (
              <tr key={entry.hour} style={{ borderTop: "1px solid var(--border)" }}>
                <HourTableCell>{hourRangeLabel(entry.hour)}</HourTableCell>
                {entry.coverage === "unobserved" ? (
                  <HourTableCell colSpan={3}>Sin datos</HourTableCell>
                ) : (
                  <>
                    <HourTableCell align="right">
                      {formatPercent(entry.utilization ?? 0)}
                    </HourTableCell>
                    <HourTableCell align="right">
                      {formatPercent(entry.brokenShare ?? 0)}
                    </HourTableCell>
                    <HourTableCell align="right">
                      {formatObservedHours(entry.observedHours)}
                      {entry.coverage === "sparse" ? " (pocas)" : ""}
                    </HourTableCell>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function HourTableHeading({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      scope="col"
      style={{
        textAlign: align,
        padding: "0 12px 6px 0",
        fontSize: 11,
        fontWeight: 500,
        textTransform: "uppercase",
        letterSpacing: "0.04em",
        color: "var(--text-muted)",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </th>
  );
}

function HourTableCell({
  children,
  align = "left",
  colSpan,
}: {
  children: React.ReactNode;
  align?: "left" | "right";
  colSpan?: number;
}) {
  return (
    <td
      colSpan={colSpan}
      style={{
        padding: "6px 12px 6px 0",
        textAlign: align,
        color: "var(--text-secondary)",
        fontVariantNumeric: "tabular-nums",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </td>
  );
}
