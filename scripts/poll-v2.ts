import "./env";
import { fetchStationFeedV2 } from "../src/lib/ute/v2-client";
import { classifyConnectorHealth } from "../src/lib/ute/status";

async function main() {
  const started = Date.now();
  const feed = await fetchStationFeedV2();
  process.stdout.write(
    `outcome=${feed.outcome} http=${feed.httpStatus} stations=${feed.stations.length} ` +
      `took=${((Date.now() - started) / 1000).toFixed(1)}s digest=${feed.payloadDigest?.slice(0, 12)}...\n`,
  );
  if (feed.errorMessage) process.stdout.write(`note: ${feed.errorMessage}\n`);
  if (feed.outcome !== "success") {
    process.exitCode = 1;
    return;
  }

  const health = new Map<string, number>();
  const types = new Map<string, number>();
  let connectors = 0;
  for (const st of feed.stations) {
    for (const g of st.connectorStatusAcc ?? []) {
      const h = classifyConnectorHealth(g.statusDetail);
      health.set(h, (health.get(h) ?? 0) + g.count);
      types.set(`${g.type} ${g.power}kW`, (types.get(`${g.type} ${g.power}kW`) ?? 0) + g.count);
      connectors += g.count;
    }
  }

  process.stdout.write(`\nconnectors: ${connectors}\n`);
  process.stdout.write(`health by connector: ${JSON.stringify(Object.fromEntries(health))}\n`);
  process.stdout.write(`\nconnector types (top 10):\n`);
  for (const [k, n] of [...types.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)) {
    process.stdout.write(`  ${n.toString().padStart(4)}  ${k}\n`);
  }
}

main().catch((e) => {
  process.stderr.write(`${e instanceof Error ? e.stack : String(e)}\n`);
  process.exitCode = 1;
});
