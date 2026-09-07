import { writeFileSync } from "node:fs";
import path from "node:path";
import { feature } from "topojson-client";
import { topology } from "topojson-server";
import { presimplify, simplify } from "topojson-simplify";
import countries from "world-atlas/countries-110m.json" with { type: "json" };

const WANTED: Record<string, string> = {
  "858": "Uruguay",
  "032": "Argentina",
  "076": "Brazil",
};

const OUTPUT = path.join(process.cwd(), "public", "map", "uy-region.json");

function main() {
  const geometries = countries.objects.countries.geometries.filter((entry) =>
    Object.hasOwn(WANTED, String(entry.id)),
  );

  if (geometries.length !== Object.keys(WANTED).length) {
    throw new Error(
      `expected ${Object.keys(WANTED).length} countries, found ${geometries.length} — world-atlas's country ids may have changed`,
    );
  }

  const objects: Record<string, GeoJSON.Feature> = {};
  for (const geometry of geometries) {
    const id = String(geometry.id);
    const geo = feature(countries as never, geometry as never) as GeoJSON.Feature;
    geo.properties = { name: WANTED[id] };
    objects[id] = geo;
  }

  let rebuilt = topology(objects, 1e5);
  rebuilt = presimplify(rebuilt as never) as typeof rebuilt;
  rebuilt = simplify(rebuilt as never, 0.0001) as typeof rebuilt;

  writeFileSync(OUTPUT, JSON.stringify(rebuilt));
  process.stdout.write(`Wrote ${OUTPUT} (${JSON.stringify(rebuilt).length} bytes)\n`);
}

main();
