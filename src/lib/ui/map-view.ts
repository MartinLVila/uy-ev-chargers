export type MapBounds = [[number, number], [number, number]];

export const URUGUAY_BOUNDS: MapBounds = [
  [-35.1, -58.6],
  [-29.95, -52.95],
];

const TILE_SIZE = 256;

function mercatorY(latitude: number): number {
  return Math.log(Math.tan(Math.PI / 4 + (latitude * Math.PI) / 360));
}

export function boundsSizeAtZoom(
  bounds: MapBounds,
  zoom: number,
): { width: number; height: number } {
  const [[south, west], [north, east]] = bounds;
  const world = TILE_SIZE * 2 ** zoom;

  return {
    width: ((east - west) / 360) * world,
    height: ((mercatorY(north) - mercatorY(south)) / (2 * Math.PI)) * world,
  };
}

const COUNTRY = boundsSizeAtZoom(URUGUAY_BOUNDS, 0);

export const MAP_FRAME_ASPECT = COUNTRY.width / COUNTRY.height;

export const MAP_FRAME_MAX_HEIGHT = 600;
