"use client";

import dynamic from "next/dynamic";
import type { StationStatus } from "@/lib/metrics/queries";

const StationMap = dynamic(() => import("./StationMap").then((module) => module.StationMap), {
  ssr: false,
  loading: () => (
    <div
      style={{
        height: 460,
        borderRadius: 10,
        border: "1px solid var(--border)",
        background: "var(--surface-2)",
        display: "grid",
        placeItems: "center",
        color: "var(--text-muted)",
        fontSize: 13,
      }}
    >
      Cargando mapa…
    </div>
  ),
});

export function StationMapPanel({ stations }: { stations: StationStatus[] }) {
  return <StationMap stations={stations} />;
}
