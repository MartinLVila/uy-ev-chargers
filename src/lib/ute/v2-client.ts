import { createHash } from "node:crypto";
import { z } from "zod";
import type { FeedResult } from "./client";
import type { StationPayload } from "./types";

const APP_TOKEN_URL = "https://movilidadelectrica.ute.com.uy/api/v2/token";
const STATUS_FILTERED_URL =
  "https://movilidadelectrica.ute.com.uy/api/v2/station/statusFiltered";

const CLIENT_ID = "cargaME";
const DEFAULT_TIMEOUT_MS = 20_000;

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

const v2BulkStationSchema = z.object({
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

type V2BulkStation = z.infer<typeof v2BulkStationSchema>;

const SYNTHETIC_TYPE = "Estación";

function toStationPayload(st: V2BulkStation): StationPayload {
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

const bulkEnvelopeSchema = z.union([
  z.object({ data: z.array(z.unknown()) }),
  z.array(z.unknown()),
]);

export interface FetchFeedV2Options {
  timeoutMs?: number;
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

  const timeout = AbortSignal.timeout(timeoutMs);
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;

  let token: string;
  try {
    token = options.token ?? (await fetchAnonymousToken(timeoutMs, signal));
  } catch (e) {
    return err("fetch_error", null, e instanceof Error ? e.message : String(e));
  }

  let response: Response;
  try {
    response = await fetch(STATUS_FILTERED_URL, {
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
  } catch (e) {
    return err("fetch_error", null, e instanceof Error ? e.message : String(e));
  }

  let body: string;
  try {
    body = await response.text();
  } catch (e) {
    return err("fetch_error", response.status, e instanceof Error ? e.message : String(e));
  }
  if (!response.ok) return err("fetch_error", response.status, `statusFiltered ${response.status}`);

  const payloadDigest = createHash("sha256").update(body).digest("hex");

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch (e) {
    return err("parse_error", response.status, e instanceof Error ? e.message : String(e));
  }

  const envelope = bulkEnvelopeSchema.safeParse(parsed);
  if (!envelope.success) {
    return {
      ...err("parse_error", response.status, "unexpected statusFiltered envelope"),
      payloadDigest,
    };
  }
  const records = Array.isArray(envelope.data) ? envelope.data : envelope.data.data;

  const stations: StationPayload[] = [];
  const rejections: string[] = [];
  for (const [i, record] of records.entries()) {
    const st = v2BulkStationSchema.safeParse(record);
    if (st.success) {
      stations.push(toStationPayload(st.data));
    } else {
      const issue = st.error.issues[0];
      rejections.push(`#${i} ${issue ? `${issue.path.join(".")}: ${issue.message}` : "invalid"}`);
    }
  }

  if (stations.length === 0 && records.length > 0) {
    return {
      ...err("parse_error", response.status, `No station validated: ${rejections.slice(0, 3).join("; ")}`),
      payloadDigest,
    };
  }

  return {
    outcome: "success",
    httpStatus: response.status,
    durationMs: Date.now() - startedAt,
    payloadDigest,
    stations,
    rejectedStations: rejections.length,
    errorMessage:
      rejections.length > 0 ? `Skipped ${rejections.length}: ${rejections.slice(0, 3).join("; ")}` : null,
  };
}
