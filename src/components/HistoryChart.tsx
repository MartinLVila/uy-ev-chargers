import { formatDay, formatPercent } from "@/lib/ui/format";
import type { HistorySlot } from "@/lib/ui/history-window";

interface HistoryChartProps {
  slots: HistorySlot[];
}

const BAD_RATIO = 0.085;
const WARN_RATIO = 0.075;

function fillColor(ratio: number): string {
  if (ratio >= BAD_RATIO) return "var(--status-critical)";
  if (ratio >= WARN_RATIO) return "var(--status-warning)";
  return "var(--status-good)";
}

export function HistoryChart({ slots }: HistoryChartProps) {
  const observedSlots = slots.filter((slot) => slot.point !== null);

  if (observedSlots.length === 0) {
    return (
      <p style={{ margin: 0, fontSize: 13, color: "var(--text-muted)" }}>
        Todavía no hay historial suficiente para graficar.
      </p>
    );
  }

  const maxValue = Math.max(0.0001, ...observedSlots.map((slot) => slot.point!.outOfServiceRatio));
  const worst = observedSlots.reduce((worst, slot) =>
    slot.point!.outOfServiceRatio > worst.point!.outOfServiceRatio ? slot : worst,
  );

  return (
    <div>
      <p className="visually-hidden">
        Porcentaje de conectores fuera de servicio por día, del {formatDay(slots[0].day)} al{" "}
        {formatDay(slots[slots.length - 1].day)}. El peor día fue el {formatDay(worst.day)} con{" "}
        {formatPercent(worst.point!.outOfServiceRatio)}. Los días sin lectura se marcan como sin
        datos.
      </p>

      <ul role="list" className="history-bars">
        {slots.map((slot, index) => (
          <li key={slot.day} className="history-bar" style={{ "--index": index } as React.CSSProperties}>
            <span className="history-bar-value">
              {slot.point ? formatPercent(slot.point.outOfServiceRatio) : "–"}
            </span>
            <span className="history-bar-track" aria-hidden="true">
              {slot.point ? (
                <span
                  className="history-bar-fill"
                  style={{
                    height: `${(slot.point.outOfServiceRatio / maxValue) * 100}%`,
                    minHeight: slot.point.outOfServiceRatio > 0 ? 2 : 0,
                    background: fillColor(slot.point.outOfServiceRatio),
                  }}
                />
              ) : (
                <span className="history-bar-gap" />
              )}
            </span>
            <span className="history-bar-date">{formatDay(slot.day)}</span>
          </li>
        ))}
      </ul>

      <div className="visually-hidden">
        <table>
          <caption>Porcentaje de conectores fuera de servicio por día</caption>
          <thead>
            <tr>
              <th scope="col">Día</th>
              <th scope="col">Fuera de servicio</th>
            </tr>
          </thead>
          <tbody>
            {slots.map((slot) => (
              <tr key={slot.day}>
                <th scope="row">{formatDay(slot.day)}</th>
                <td>{slot.point ? formatPercent(slot.point.outOfServiceRatio) : "Sin datos"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
