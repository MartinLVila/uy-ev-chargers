import { formatDay, formatNumber } from "@/lib/ui/format";
import type { HistorySlot } from "@/lib/ui/history-window";

interface HistoryChartProps {
  slots: HistorySlot[];
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

  const maxValue = Math.max(1, ...observedSlots.map((slot) => slot.point!.connectorsOutOfService));
  const worst = observedSlots.reduce((worst, slot) =>
    slot.point!.connectorsOutOfService > worst.point!.connectorsOutOfService ? slot : worst,
  );

  return (
    <div>
      <p className="visually-hidden">
        Conectores fuera de servicio por día, del {formatDay(slots[0].day)} al{" "}
        {formatDay(slots[slots.length - 1].day)}. El peor día fue el {formatDay(worst.day)} con{" "}
        {formatNumber(worst.point!.connectorsOutOfService)}. Los días sin lectura se marcan como sin
        datos.
      </p>

      <ul role="list" className="history-bars">
        {slots.map((slot, index) => (
          <li key={slot.day} className="history-bar" style={{ "--index": index } as React.CSSProperties}>
            <span className="history-bar-value">
              {slot.point ? formatNumber(slot.point.connectorsOutOfService) : "–"}
            </span>
            <span className="history-bar-track" aria-hidden="true">
              {slot.point ? (
                <span
                  className="history-bar-fill"
                  style={{
                    height: `${(slot.point.connectorsOutOfService / maxValue) * 100}%`,
                    minHeight: slot.point.connectorsOutOfService > 0 ? 2 : 0,
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
          <caption>Conectores fuera de servicio por día</caption>
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
                <td>
                  {slot.point ? formatNumber(slot.point.connectorsOutOfService) : "Sin datos"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
