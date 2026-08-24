"use client";

import { useMemo, useRef, useState } from "react";
import type { DailyPoint } from "@/lib/metrics/queries";
import { formatDay, formatNumber, formatPercent } from "@/lib/ui/format";

const VIEW_WIDTH = 840;
const VIEW_HEIGHT = 260;
const PADDING = { top: 16, right: 20, bottom: 28, left: 44 };

interface HistoryChartProps {
  series: DailyPoint[];
}

export function HistoryChart({ series }: HistoryChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const geometry = useMemo(() => {
    if (series.length === 0) return null;

    const plotWidth = VIEW_WIDTH - PADDING.left - PADDING.right;
    const plotHeight = VIEW_HEIGHT - PADDING.top - PADDING.bottom;
    const observed = Math.max(
      0,
      ...series.map((point) =>
        Math.max(point.connectorsTracked + point.connectorsAbsent, point.connectorsOutOfService),
      ),
    );
    const maxValue = Math.max(1, Math.ceil(observed));

    const xFor = (index: number) =>
      series.length === 1
        ? PADDING.left + plotWidth / 2
        : PADDING.left + (index / (series.length - 1)) * plotWidth;
    const yFor = (value: number) =>
      PADDING.top + plotHeight - (value / maxValue) * plotHeight;

    const line = (accessor: (point: DailyPoint) => number) =>
      series.map((point, index) => `${index === 0 ? "M" : "L"}${xFor(index)} ${yFor(accessor(point))}`).join(" ");

    const outageLine = line((point) => point.connectorsOutOfService);
    const areaPath = `${outageLine} L${xFor(series.length - 1)} ${yFor(0)} L${xFor(0)} ${yFor(0)} Z`;

    const ticks = [0, 0.5, 1].map((fraction) => ({
      value: maxValue * fraction,
      y: yFor(maxValue * fraction),
    }));

    return {
      xFor,
      yFor,
      maxValue,
      outageLine,
      areaPath,
      fleetLine: line((point) => point.connectorsTracked + point.connectorsAbsent),
      ticks,
    };
  }, [series]);

  if (!geometry) {
    return (
      <p style={{ margin: 0, fontSize: 13, color: "var(--text-muted)" }}>
        Todavía no hay historial suficiente para graficar.
      </p>
    );
  }

  const handlePointer = (event: React.PointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return;
    const bounds = svg.getBoundingClientRect();
    const ratio = (event.clientX - bounds.left) / bounds.width;
    const x = ratio * VIEW_WIDTH;
    const plotWidth = VIEW_WIDTH - PADDING.left - PADDING.right;
    const position = ((x - PADDING.left) / plotWidth) * (series.length - 1);
    const index = Math.min(series.length - 1, Math.max(0, Math.round(position)));
    setActiveIndex(index);
  };

  const active = activeIndex === null ? null : series[activeIndex];
  const lastPoint = series[series.length - 1];

  return (
    <div>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
        style={{ width: "100%", height: "auto", display: "block", touchAction: "none" }}
        onPointerMove={handlePointer}
        onPointerDown={handlePointer}
        onPointerLeave={() => setActiveIndex(null)}
        role="img"
        aria-label="Conectores fuera de servicio por día"
      >
        {geometry.ticks.map((tick) => (
          <g key={tick.y}>
            <line
              x1={PADDING.left}
              x2={VIEW_WIDTH - PADDING.right}
              y1={tick.y}
              y2={tick.y}
              stroke="var(--grid)"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
            <text
              x={PADDING.left - 8}
              y={tick.y + 4}
              textAnchor="end"
              fontSize={11}
              fill="var(--text-muted)"
            >
              {formatNumber(Math.round(tick.value))}
            </text>
          </g>
        ))}

        <path d={geometry.areaPath} fill="var(--status-critical)" opacity={0.14} />
        <path
          d={geometry.fleetLine}
          fill="none"
          stroke="var(--border-strong)"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
        <path
          d={geometry.outageLine}
          fill="none"
          stroke="var(--status-critical)"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />

        {activeIndex !== null && active && (
          <g>
            <line
              x1={geometry.xFor(activeIndex)}
              x2={geometry.xFor(activeIndex)}
              y1={PADDING.top}
              y2={VIEW_HEIGHT - PADDING.bottom}
              stroke="var(--border-strong)"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
            <circle
              cx={geometry.xFor(activeIndex)}
              cy={geometry.yFor(active.connectorsOutOfService)}
              r={5}
              fill="var(--status-critical)"
              stroke="var(--surface-1)"
              strokeWidth={2}
              vectorEffect="non-scaling-stroke"
            />
          </g>
        )}

        <text
          x={PADDING.left}
          y={VIEW_HEIGHT - 8}
          fontSize={11}
          fill="var(--text-muted)"
          textAnchor="start"
        >
          {formatDay(series[0].day)}
        </text>
        <text
          x={VIEW_WIDTH - PADDING.right}
          y={VIEW_HEIGHT - 8}
          fontSize={11}
          fill="var(--text-muted)"
          textAnchor="end"
        >
          {formatDay(lastPoint.day)}
        </text>
      </svg>

      <div
        style={{
          minHeight: 44,
          marginTop: 8,
          fontSize: 13,
          color: "var(--text-secondary)",
          display: "flex",
          flexWrap: "wrap",
          gap: "4px 20px",
          alignItems: "center",
        }}
      >
        {active ? (
          <>
            <strong style={{ color: "var(--text-primary)" }}>{formatDay(active.day)}</strong>
            <span>
              <Swatch color="var(--status-critical)" /> Fuera de servicio{" "}
              <strong style={{ color: "var(--text-primary)" }}>
                {formatNumber(active.connectorsOutOfService)}
              </strong>{" "}
              ({formatPercent(active.outOfServiceRatio)})
            </span>
            <span>
              <Swatch color="var(--border-strong)" /> Flota{" "}
              <strong style={{ color: "var(--text-primary)" }}>
                {formatNumber(active.connectorsTracked + active.connectorsAbsent)}
              </strong>
            </span>
          </>
        ) : (
          <>
            <span>
              <Swatch color="var(--status-critical)" /> Conectores fuera de servicio
            </span>
            <span>
              <Swatch color="var(--border-strong)" /> Flota total conocida
            </span>
            <span style={{ color: "var(--text-muted)" }}>Pasá el cursor para ver cada día</span>
          </>
        )}
      </div>
    </div>
  );
}

function Swatch({ color }: { color: string }) {
  return (
    <span
      aria-hidden
      style={{
        display: "inline-block",
        width: 10,
        height: 10,
        borderRadius: 3,
        background: color,
        marginRight: 6,
      }}
    />
  );
}
