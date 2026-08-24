import "./env";
import { fetchStationFeedV2 } from "../src/lib/ute/v2-client";
import { classifyConnectorHealth } from "../src/lib/ute/status";

async function main() {
  const feed = await fetchStationFeedV2();
  process.stdout.write(
    `outcome=${feed.outcome} http=${feed.httpStatus} stations=${feed.stations.length} ` +
      `rejected=${feed.rejectedStations} digest=${feed.payloadDigest?.slice(0, 12)}...\n`,
  );
  if (feed.outcome !== "success") {
    process.stdout.write(`error: ${feed.errorMessage}\n`);
    process.exitCode = 1;
    return;
  }

  const health = new Map<string, number>();
  const faulted: string[] = [];
  for (const st of feed.stations) {
    const g = (st.connectorStatusAcc ?? [])[0];
    const h = classifyConnectorHealth(g?.statusDetail);
    health.set(h, (health.get(h) ?? 0) + 1);
    if (h === "faulted") faulted.push(`${st.name} (${g?.statusDetail})`);
  }

  process.stdout.write(
    `\nhealth distribution: ${JSON.stringify(Object.fromEntries(health))}\n`,
  );
  process.stdout.write(`\nfaulted stations (${faulted.length}):\n`);
  for (const f of faulted) process.stdout.write(`  - ${f}\n`);
}

main().catch((e) => {
  process.stderr.write(`${e instanceof Error ? e.stack : String(e)}\n`);
  process.exitCode = 1;
});
