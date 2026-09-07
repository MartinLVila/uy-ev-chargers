import type { Topology } from "topojson-specification";
import { HudMapView } from "@/components/HudMapView";
import type { StationStatus } from "@/lib/metrics/queries";
import { buildCountryPaths, buildLocalityPoints } from "@/lib/ui/hud-map";
import { aggregateByLocality } from "@/lib/ui/locality";
import geometry from "../../public/map/uy-region.json";

export function HudMap({ stations }: { stations: StationStatus[] }) {
  const localities = aggregateByLocality(stations);
  const { paths, projection } = buildCountryPaths(geometry as unknown as Topology);
  const points = buildLocalityPoints(localities, projection);

  return <HudMapView paths={paths} points={points} />;
}
