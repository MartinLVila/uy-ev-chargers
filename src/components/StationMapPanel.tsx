"use client";

import dynamic from "next/dynamic";
import type { StationStatus } from "@/lib/metrics/queries";
import { MAP_FRAME_ASPECT, MAP_FRAME_MAX_HEIGHT } from "@/lib/ui/map-view";

const StationMap = dynamic(() => import("./StationMap").then((module) => module.StationMap), {
  ssr: false,
  loading: () => (
    <div
      style={{
        aspectRatio: MAP_FRAME_ASPECT,
        maxHeight: MAP_FRAME_MAX_HEIGHT,
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
