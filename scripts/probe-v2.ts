import "./env";
import { fetchAnonymousToken } from "../src/lib/ute/v2-client";

const opt = (id: number, text: string, internalCode = "", icon = "") => ({
  id,
  internalCode,
  text,
  selected: true,
  icon,
});
const FILTER = {
  connectorTypes: [
    opt(1, "Tipo 2", "", "assets/images/Tipo2/desconocido.png"),
    opt(2, "CCS2", "", "assets/images/CCS2/desconocido.png"),
    opt(3, "CHAdeMO", "", "assets/images/Chademo/desconocido.png"),
    opt(4, "GB/T", "", "assets/images/Gbt/desconocido.png"),
  ],
  connectorStatuses: [opt(1, "Disponible"), opt(2, "Cargando"), opt(3, "Sin Comunicación")],
  connectorPowers: [opt(1, "0")],
  connectorCables: [opt(1, "Con cable"), opt(2, "Sin cable")],
  connectorNetworks: [
    opt(1, "Pública", "PUBLIC"),
    opt(2, "Taxi", "TAXI"),
    opt(3, "DMC", "DMC"),
    opt(4, "EVO", "EVO"),
    opt(5, "eOne", "ONE"),
    opt(6, "UMT", "UMT"),
  ],
};

async function main() {
  let token = process.env.UTE_TOKEN ?? "";
  if (!token) {
    process.stdout.write("Fetching anonymous token (client_credentials cargaME/apiME)...\n");
    token = await fetchAnonymousToken();
    process.stdout.write(`  token OK (len=${token.length})\n`);
  } else {
    process.stdout.write("Using injected UTE_TOKEN\n");
  }

  const res = await fetch(
    "https://movilidadelectrica.ute.com.uy/api/v2/station/statusFiltered",
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify(FILTER),
    },
  );
  const text = await res.text();
  process.stdout.write(`statusFiltered -> HTTP ${res.status}, ${text.length} bytes\n`);
  if (!res.ok) {
    process.stdout.write(text.slice(0, 500) + "\n");
    return;
  }

  const json = JSON.parse(text) as Record<string, unknown>;
  const records = (
    Array.isArray(json) ? json : (json.data ?? json.result ?? [])
  ) as Array<Record<string, unknown>>;
  process.stdout.write(`envelope top-level keys: ${Object.keys(json).join(", ") || "(array)"}\n`);
  process.stdout.write(`stations: ${records.length}\n`);

  type Acc = { statusDetail?: unknown; count?: number };
  const accOf = (st: Record<string, unknown>): Acc[] =>
    Array.isArray(st.connectorStatusAcc) ? (st.connectorStatusAcc as Acc[]) : [];

  const first = records[0] ?? {};
  process.stdout.write(`first station keys: ${Object.keys(first).join(", ")}\n`);
  process.stdout.write(`\n--- FULL first 2 stations ---\n`);
  process.stdout.write(JSON.stringify(records.slice(0, 2), null, 2) + "\n");

  const statusCounts = new Map<string, number>();
  for (const st of records) {
    const key = `${JSON.stringify(st.status)} / ${JSON.stringify(st.statusDetails)}`.slice(0, 60);
    statusCounts.set(key, (statusCounts.get(key) ?? 0) + 1);
  }
  process.stdout.write(`\n--- station status/statusDetails distribution (top 12) ---\n`);
  for (const [k, n] of [...statusCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)) {
    process.stdout.write(`  ${n.toString().padStart(4)}  ${k}\n`);
  }
  void accOf;
}

main().catch((e) => {
  process.stderr.write(`PROBE FAILED: ${e instanceof Error ? e.stack : String(e)}\n`);
  process.exitCode = 1;
});
