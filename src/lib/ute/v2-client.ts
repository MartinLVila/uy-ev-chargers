import { createHash } from "node:crypto";
import { z } from "zod";
import {
  connectorGroupPayloadSchema,
  latitudeSchema,
  longitudeSchema,
  stationPayloadSchema,
  unknownWhenOverlong,
  MAX_CONNECTOR_GROUPS_PER_STATION,
  MAX_FEED_TEXT,
  type FeedResult,
  type StationPayload,
  type UnusableFeed,
  type UnusableFeedOutcome,
} from "./types";

const APP_TOKEN_URL = "https://movilidadelectrica.ute.com.uy/api/v2/token";
const STATUS_FILTERED_URL =
  "https://movilidadelectrica.ute.com.uy/api/v2/station/statusFiltered";
const STATUS_FILTERED_ID_URL =
  "https://movilidadelectrica.ute.com.uy/api/v2/station/statusFilteredId";

const CLIENT_ID = "cargaME";
const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_OVERALL_TIMEOUT_MS = 120_000;
const DETAIL_CONCURRENCY = 8;
const DETAIL_ATTEMPTS = 3;
const DETAIL_RETRY_DELAY_MS = 500;
const MIN_TELEMETRY_COVERAGE = 0.8;
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;

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

async function readJsonWithinBudget(res: Response): Promise<unknown> {
  const declared = Number(res.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_RESPONSE_BYTES) {
    throw new Error(`response declares ${declared} bytes, over the ${MAX_RESPONSE_BYTES} budget`);
  }

  if (!res.body) return res.json();

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;

    received += value.byteLength;
    if (received > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      throw new Error(`response passed the ${MAX_RESPONSE_BYTES} byte budget`);
    }
    chunks.push(value);
  }

  const body = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return JSON.parse(new TextDecoder().decode(body));
}

const bulkStationSchema = z.object({
  id: z.number().int(),
  name: z.string().min(1).max(MAX_FEED_TEXT.name),
  source: unknownWhenOverlong(MAX_FEED_TEXT.source),
  status: z.number().int().nullable().optional(),
  statusDetails: unknownWhenOverlong(MAX_FEED_TEXT.status),
  lat: latitudeSchema,
  lng: longitudeSchema,
  chargeNetworkName: unknownWhenOverlong(MAX_FEED_TEXT.source),
  countryCode: unknownWhenOverlong(MAX_FEED_TEXT.code),
});

type BulkStation = z.infer<typeof bulkStationSchema>;

const bulkEnvelopeSchema = z.union([
  z.object({ data: z.array(z.unknown()) }),
  z.array(z.unknown()),
]);

const detailDataSchema = z.object({
  id: z.number().int(),
  name: z.string().min(1).max(MAX_FEED_TEXT.name),
  source: unknownWhenOverlong(MAX_FEED_TEXT.source),
  address: unknownWhenOverlong(MAX_FEED_TEXT.address),
  lat: latitudeSchema,
  lng: longitudeSchema,
  department: unknownWhenOverlong(MAX_FEED_TEXT.place),
  city: unknownWhenOverlong(MAX_FEED_TEXT.place),
  status: unknownWhenOverlong(MAX_FEED_TEXT.status),
  connectorStatusAcc: z
    .array(connectorGroupPayloadSchema)
    .max(MAX_CONNECTOR_GROUPS_PER_STATION)
    .nullable()
    .optional(),
});

const detailEnvelopeSchema = z.object({ data: detailDataSchema.nullable().optional() });

function asStationPayload(candidate: unknown): StationPayload | null {
  const parsed = stationPayloadSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

function stationWithoutConnectorTelemetry(st: BulkStation): StationPayload | null {
  return asStationPayload({
    source: st.source ?? null,
    name: st.name,
    address: null,
    lat: st.lat,
    lng: st.lng,
    department: null,
    city: null,
    status: st.statusDetails ?? null,
    connectorStatusAcc: null,
  });
}

function detailPayload(data: z.infer<typeof detailDataSchema>): StationPayload | null {
  return asStationPayload({
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
  });
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
  const parsed = tokenResponseSchema.parse(await readJsonWithinBudget(res));
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
  const parsed = bulkEnvelopeSchema.parse(await readJsonWithinBudget(res));
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

type DetailOutcome =
  | { status: "ok"; payload: StationPayload }
  | { status: "unauthorized" }
  | { status: "malformed" }
  | { status: "unavailable" };

const UNAVAILABLE: DetailOutcome = { status: "unavailable" };

async function fetchStationDetail(
  token: string,
  station: BulkStation,
  signal: AbortSignal,
): Promise<DetailOutcome> {
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
  if (res.status === 401 || res.status === 403) return { status: "unauthorized" };
  if (!res.ok) return UNAVAILABLE;

  let body: unknown;
  try {
    body = await readJsonWithinBudget(res);
  } catch {
    return { status: "malformed" };
  }

  const parsed = detailEnvelopeSchema.safeParse(body);
  if (!parsed.success) return { status: "malformed" };
  if (!parsed.data.data) return UNAVAILABLE;

  const payload = detailPayload(parsed.data.data);
  if (!payload) return { status: "malformed" };
  if ((payload.connectorStatusAcc?.length ?? 0) === 0) return UNAVAILABLE;
  return { status: "ok", payload };
}

async function fetchStationDetailWithRetries(
  token: string,
  station: BulkStation,
  requestSignal: () => AbortSignal,
): Promise<DetailOutcome> {
  let outcome: DetailOutcome = UNAVAILABLE;

  for (let attempt = 1; attempt <= DETAIL_ATTEMPTS; attempt += 1) {
    outcome = await fetchStationDetail(token, station, requestSignal()).catch(() => UNAVAILABLE);
    if (outcome.status !== "unavailable") return outcome;
    if (attempt < DETAIL_ATTEMPTS) await delay(DETAIL_RETRY_DELAY_MS * attempt);
  }

  return outcome;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
    outcome: UnusableFeedOutcome,
    httpStatus: number | null,
    message: string,
  ): UnusableFeed => ({
    outcome,
    httpStatus,
    durationMs: Date.now() - startedAt,
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

  let withoutTelemetry = 0;
  let unauthorized = 0;
  let malformedDetails = 0;
  const polled = await mapPool(bulk, DETAIL_CONCURRENCY, async (st) => {
    const detail = await fetchStationDetailWithRetries(token, st, reqSignal);
    if (detail.status === "ok") return detail.payload;
    if (detail.status === "unauthorized") unauthorized += 1;
    if (detail.status === "malformed") malformedDetails += 1;
    withoutTelemetry += 1;
    return stationWithoutConnectorTelemetry(st);
  });

  const stations = polled.filter((payload): payload is StationPayload => payload !== null);
  const malformedStations = polled.length - stations.length;

  const covered = bulk.length - withoutTelemetry;
  if (covered < bulk.length * MIN_TELEMETRY_COVERAGE) {
    const causes: string[] = [];
    if (unauthorized > 0) causes.push(`${unauthorized} rejected the token`);
    if (malformedDetails > 0) causes.push(`${malformedDetails} failed the feed schema`);
    const cause = causes.length > 0 ? ` (${causes.join(", ")})` : "";
    return err(
      "fetch_error",
      unauthorized > 0 ? 401 : null,
      `connector telemetry missing for ${withoutTelemetry} of ${bulk.length} stations${cause}`,
    );
  }

  const dropped = bulkRejected + malformedStations;
  if (dropped > 0) {
    return err(
      "parse_error",
      200,
      `${dropped} of ${bulk.length + bulkRejected} station(s) failed the feed schema; refusing to ` +
        `report a feed that is missing them, since an absent station reads as one that left the network`,
    );
  }

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
  const silent = withoutTelemetry - malformedDetails;
  if (silent > 0) notes.push(`${silent} station(s) reported no connector telemetry`);
  if (malformedDetails > 0) {
    notes.push(`${malformedDetails} station(s) reported telemetry that failed the feed schema`);
  }

  return {
    outcome: "success",
    httpStatus: 200,
    durationMs: Date.now() - startedAt,
    payloadDigest,
    stations,
    errorMessage: notes.length > 0 ? notes.join("; ") : null,
  };
}
