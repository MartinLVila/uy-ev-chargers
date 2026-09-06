import type { MapBounds } from "./map-view";

export interface FittableMap {
  on(event: string, listener: () => void): void;
  off(event: string, listener: () => void): void;
  fitBounds(bounds: MapBounds, options: { animate: boolean }): void;
}

const READER_MOVED_IT = ["zoomend", "dragend"];
const FRAME_CHANGED_SIZE = "resize";

export function keepFittingUntilTheReaderMoves(map: FittableMap, bounds: MapBounds): () => void {
  let readerHasMoved = false;
  let fittingOurselves = false;

  const remember = () => {
    if (!fittingOurselves) readerHasMoved = true;
  };

  const fit = () => {
    if (readerHasMoved) return;

    fittingOurselves = true;
    map.fitBounds(bounds, { animate: false });
    fittingOurselves = false;
  };

  for (const moved of READER_MOVED_IT) map.on(moved, remember);
  map.on(FRAME_CHANGED_SIZE, fit);

  return () => {
    for (const moved of READER_MOVED_IT) map.off(moved, remember);
    map.off(FRAME_CHANGED_SIZE, fit);
  };
}
