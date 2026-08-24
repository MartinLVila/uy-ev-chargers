import "./env";
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { sql } from "drizzle-orm";
import { getDb } from "../src/lib/db/client";
import { getDailyHistory, getStationStatuses, type SqlRunner } from "../src/lib/metrics/queries";

const OUTPUT_DIR = path.join(process.cwd(), "data");

async function main() {
  const db = getDb();
  const runner = db as unknown as SqlRunner;

  const { rows } = await db.execute<{ first_poll: Date | string | null }>(
    sql`SELECT MIN(started_at) AS first_poll FROM poll_runs WHERE outcome = 'success'`,
  );

  const firstPoll = rows[0]?.first_poll ? new Date(rows[0].first_poll) : null;
  if (!firstPoll || Number.isNaN(firstPoll.getTime())) {
    process.stdout.write("No successful poll recorded yet; nothing to write.\n");
    return;
  }

  const [stations, history] = await Promise.all([
    getStationStatuses(runner),
    getDailyHistory(runner, { from: firstPoll, to: new Date() }),
  ]);

  await mkdir(OUTPUT_DIR, { recursive: true });

  const orderedStations = [...stations]
    .sort((a, b) => a.slug.localeCompare(b.slug))
    .map((station) => ({
      slug: station.slug,
      name: station.name,
      address: station.address,
      city: station.city,
      department: station.department,
      latitude: station.latitude,
      longitude: station.longitude,
      presence: station.presence,
      connectors: station.connectors,
      operational: station.operational,
      faulted: station.faulted,
      unknown: station.unknown,
      absent: station.absent,
      outOfService: station.outOfService,
    }));

  await writeFile(
    path.join(OUTPUT_DIR, "stations.json"),
    `${JSON.stringify(orderedStations, null, 2)}\n`,
    "utf8",
  );

  const header =
    "day,connectors_tracked,connectors_absent,connectors_out_of_service,out_of_service_ratio,stations_delisted";
  const lines = history.map((point) =>
    [
      point.day,
      point.connectorsTracked,
      point.connectorsAbsent,
      point.connectorsOutOfService,
      point.outOfServiceRatio,
      point.stationsDelisted,
    ].join(","),
  );
  await writeFile(
    path.join(OUTPUT_DIR, "network-history.csv"),
    `${[header, ...lines].join("\n")}\n`,
    "utf8",
  );

  const latest = history[history.length - 1];
  const fleet = orderedStations.reduce(
    (total, station) => total + station.connectors + station.absent,
    0,
  );
  const outOfService = orderedStations.reduce((total, station) => total + station.outOfService, 0);
  const unreachable = orderedStations.filter((station) => station.presence !== "listed").length;

  const parts = [`${outOfService} of ${fleet} connectors out of service`];
  if (unreachable > 0) parts.push(`${unreachable} stations not reporting`);

  const message = `Record ${latest?.day ?? "network"} state: ${parts.join(", ")}`;

  await appendGitHubOutput("message", message);
  process.stdout.write(
    `${message}\nWrote ${orderedStations.length} stations and ${history.length} daily rows.\n`,
  );
}

async function appendGitHubOutput(key: string, value: string): Promise<void> {
  const target = process.env.GITHUB_OUTPUT;
  if (!target) return;
  await appendFile(target, `${key}=${value.replace(/\r?\n/g, " ")}\n`, "utf8");
}

main().catch((error: unknown) => {
  process.stderr.write(`Snapshot failed: ${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
