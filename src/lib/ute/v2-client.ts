import { createHash } from "node:crypto";
import { z } from "zod";
import type { FeedResult } from "./client";
import type { StationPayload } from "./types";

const APP_TOKEN_URL = "https://movilidadelectrica.ute.com.uy/api/v2/token";
const STATUS_FILTERED_URL =
  "https://movilidadelectrica.ute.com.uy/api/v2/station/statusFiltered";
const STATUS_FILTERED_ID_URL =
  "https://movilidadelectrica.ute.com.uy/api/v2/station/statusFilteredId";

const CLIENT_ID = "cargaME";
const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_OVERALL_TIMEOUT_MS = 120_000;
const DETAIL_CONCURRENCY = 8;

const opt = (id: number, text: string, internalCode = "", icon = "") => ({
  id,
  internalCode,
  text,
  selected: true,
  icon,
});

const FILTER_OPTIONS_REQUEST = {
  connectorTypes: [
    opt(1, "Tipo 2", "", "assets/images/Tipo2/desconocido.png"),
    opt(2, "CCS2", "", "assets/images/CCS2/desconocido.png"),
    opt(3, "CHAdeMO", "", "assets/images/Chademo/desconocido.png"),
    opt(4, "GB/T", "", "assets/images/Gbt/desconocido.png"),
  ],
  connectorStatuses: [
    opt(1, "Disponible"),
    opt(2, "Cargando"),
    opt(3, "Sin Comunicación"),
  ],
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
} as const;

const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().optional(),
  token_type: z.string().optional(),
});

const bulkStationSchema = z.object({
  id: z.number().int(),
  name: z.string().min(1),
  source: z.string().nullable().optional(),
  status: z.number().int().nullable().optional(),
  statusDetails: z.string().nullable().optional(),
  lat: z.coerce.number(),
  lng: z.coerce.number(),
  chargeNetworkName: z.string().nullable().optional(),
  countryCode: z.string().nullable().optional(),
});

type BulkStation = z.infer<typeof bulkStationSchema>;

const bulkEnvelopeSchema = z.union([
  z.object({ data: z.array(z.unknown()) }),
  z.array(z.unknown()),
]);

const connectorGroupSchema = z.object({
  count: z.number().int().nonnegative(),
  type: z.string().min(1),
  power: z.coerce.number().nonnegative(),
  status: z.number().int().nullable().optional(),
  statusDetail: z.string().nullable().optional(),
  hose: z.boolean().nullable().optional(),
});

const detailDataSchema = z.object({
  id: z.number().int(),
  name: z.string().min(1),
  source: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  lat: z.coerce.number(),
  lng: z.coerce.number(),
  department: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  status: z.string().nullable().optional(),
  connectorStatusAcc: z.array(connectorGroupSchema).nullable().optional(),
});

const detailEnvelopeSchema = z.object({ data: detailDataSchema.nullable().optional() });

const SYNTHETIC_TYPE = "Estación";

function stationLevelPayload(st: BulkStation): StationPayload {
  const detail = st.statusDetails ?? null;
  return {
    source: st.source ?? null,
    name: st.name,
    address: null,
    lat: st.lat,
    lng: st.lng,
    department: null,
    city: null,
    status: detail,
    connectorStatusAcc: [
      {
        count: 1,
        type: SYNTHETIC_TYPE,
        power: 0,
        status: st.status ?? null,
        statusDetail: detail,
        hose: false,
      },
    ],
  };
}

function detailPayload(data: z.infer<typeof detailDataSchema>): StationPayload {
  return {
    source: data.source ?? null,
    name: data.name,
    address: data.address ?? null,
    lat: data.lat,
    lng: data.lng,
    department: data.department ?? null,
    city: data.city ?? null,
    status: data.status ?? null,
    connectorStatusAcc: (data.connectorStatusAcc ?? []).map((g) => ({
      count: g.count,
      type: g.type,
      power: g.power,
      status: g.status ?? null,
      statusDetail: g.statusDetail ?? null,
      hose: g.hose ?? null,
    })),
  };
}

export interface FetchFeedV2Options {
  timeoutMs?: number;
  overallTimeoutMs?: number;
  signal?: AbortSignal;
  token?: string;
}

export async function fetchAnonymousToken(
  timeoutMs = DEFAULT_TIMEOUT_MS,
  signal?: AbortSignal,
): Promise<string> {
  const res = await fetch(APP_TOKEN_URL, {
    method: "POST",
    signal: signal ?? AbortSignal.timeout(timeoutMs),
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ clientIdIDP: CLIENT_ID, identifier: "Anonymous" }),
  });
  if (!res.ok) throw new Error(`token endpoint ${res.status}`);
  const parsed = tokenResponseSchema.parse(await res.json());
  return parsed.access_token;
}

async function fetchBulkStations(
  token: string,
  signal: AbortSignal,
): Promise<{ stations: BulkStation[]; rejected: number }> {
  const res = await fetch(STATUS_FILTERED_URL, {
    method: "POST",
    signal,
    cache: "no-store",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify(FILTER_OPTIONS_REQUEST),
  });
  if (!res.ok) throw new Error(`statusFiltered ${res.status}`);
  const parsed = bulkEnvelopeSchema.parse(await res.json());
  const records = Array.isArray(parsed) ? parsed : parsed.data;
  const stations: BulkStation[] = [];
  let rejected = 0;
  for (const record of records) {
    const st = bulkStationSchema.safeParse(record);
    if (st.success) stations.push(st.data);
    else rejected += 1;
  }
  return { stations, rejected };
}

async function fetchStationDetail(
  token: string,
  station: BulkStation,
  signal: AbortSignal,
): Promise<StationPayload | null> {
  const res = await fetch(STATUS_FILTERED_ID_URL, {
    method: "POST",
    signal,
    cache: "no-store",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      filterOptionsRequest: FILTER_OPTIONS_REQUEST,
      stationIdentifier: {
        CountryCode: station.countryCode ?? "UY",
        PartyId: station.chargeNetworkName ?? "PUBLIC",
        StationId: String(station.id),
        Source: station.source ?? "CargaME",
      },
    }),
  });
  if (!res.ok) return null;
  const parsed = detailEnvelopeSchema.safeParse(await res.json());
  if (!parsed.success || !parsed.data.data) return null;
  return detailPayload(parsed.data.data);
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    for (;;) {
      const index = next++;
      if (index >= items.length) return;
      results[index] = await fn(items[index]);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, worker),
  );
  return results;
}

export async function fetchStationFeedV2(
  options: FetchFeedV2Options = {},
): Promise<FeedResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const startedAt = Date.now();
  const err = (
    outcome: FeedResult["outcome"],
    httpStatus: number | null,
    message: string,
  ): FeedResult => ({
    outcome,
    httpStatus,
    durationMs: Date.now() - startedAt,
    payloadDigest: null,
    stations: [],
    rejectedStations: 0,
    errorMessage: message,
  });

  const overallMs = options.overallTimeoutMs ?? DEFAULT_OVERALL_TIMEOUT_MS;
  const deadline = AbortSignal.timeout(overallMs);
  const feedSignal = options.signal ? AbortSignal.any([options.signal, deadline]) : deadline;
  const reqSignal = () => AbortSignal.any([feedSignal, AbortSignal.timeout(timeoutMs)]);

  let token: string;
  try {
    token = options.token ?? (await fetchAnonymousToken(timeoutMs, reqSignal()));
  } catch (e) {
    return err("fetch_error", null, e instanceof Error ? e.message : String(e));
  }

  let bulk: BulkStation[];
  let bulkRejected: number;
  try {
    const result = await fetchBulkStations(token, reqSignal());
    bulk = result.stations;
    bulkRejected = result.rejected;
  } catch (e) {
    return err("fetch_error", null, e instanceof Error ? e.message : String(e));
  }

  if (bulk.length === 0) {
    return err("parse_error", 200, "statusFiltered returned no stations");
  }

  let fallbacks = 0;
  const stations = await mapPool(bulk, DETAIL_CONCURRENCY, async (st) => {
    const detail = await fetchStationDetail(token, st, reqSignal()).catch(() => null);
    if (detail && (detail.connectorStatusAcc?.length ?? 0) > 0) return detail;
    fallbacks += 1;
    return stationLevelPayload(st);
  });

  const digestSource = stations
    .map((s) => ({
      name: s.name,
      groups: [...(s.connectorStatusAcc ?? [])].sort((a, b) =>
        `${a.type}|${a.power}|${a.statusDetail}`.localeCompare(
          `${b.type}|${b.power}|${b.statusDetail}`,
        ),
      ),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const payloadDigest = createHash("sha256").update(JSON.stringify(digestSource)).digest("hex");

  const notes: string[] = [];
  if (fallbacks > 0) notes.push(`${fallbacks} station(s) fell back to station-level status`);
  if (bulkRejected > 0) notes.push(`${bulkRejected} bulk record(s) rejected`);

  return {
    outcome: "success",
    httpStatus: 200,
    durationMs: Date.now() - startedAt,
    payloadDigest,
    stations,
    rejectedStations: bulkRejected,
    errorMessage: notes.length > 0 ? notes.join("; ") : null,
  };
}
