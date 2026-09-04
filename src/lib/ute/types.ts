import { z } from "zod";

export const MAX_FEED_TEXT = {
  name: 200,
  source: 100,
  address: 300,
  place: 120,
  status: 120,
  connectorType: 60,
  code: 16,
} as const;

export const MAX_CONNECTOR_GROUPS_PER_STATION = 50;

const DECIMAL = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;

function numberTheFeedReported() {
  return z
    .union([z.number(), z.string().trim().regex(DECIMAL)])
    .transform(Number)
    .pipe(z.number().refine(Number.isFinite));
}

export const connectorGroupPayloadSchema = z.object({
  count: z.number().int().nonnegative(),
  type: z.string().min(1).max(MAX_FEED_TEXT.connectorType),
  power: numberTheFeedReported().pipe(z.number().nonnegative()),
  status: z.number().int().nullable().optional(),
  statusDetail: z.string().max(MAX_FEED_TEXT.status).nullable().optional(),
  hose: z.boolean().nullable().optional(),
});

export const latitudeSchema = numberTheFeedReported().pipe(z.number().min(-90).max(90));
export const longitudeSchema = numberTheFeedReported().pipe(z.number().min(-180).max(180));

export function unknownWhenOverlong(limit: number) {
  return z.string().max(limit).nullable().optional().catch(null);
}

export const stationPayloadSchema = z.object({
  source: unknownWhenOverlong(MAX_FEED_TEXT.source),
  name: z.string().min(1).max(MAX_FEED_TEXT.name),
  address: unknownWhenOverlong(MAX_FEED_TEXT.address),
  lat: latitudeSchema,
  lng: longitudeSchema,
  connectorStatusAcc: z
    .array(connectorGroupPayloadSchema)
    .max(MAX_CONNECTOR_GROUPS_PER_STATION)
    .nullable()
    .optional(),
  department: unknownWhenOverlong(MAX_FEED_TEXT.place),
  city: unknownWhenOverlong(MAX_FEED_TEXT.place),
  status: unknownWhenOverlong(MAX_FEED_TEXT.status),
});

export type StationPayload = z.infer<typeof stationPayloadSchema>;

export type FeedOutcome = "success" | "fetch_error" | "parse_error";

export type UnusableFeedOutcome = Exclude<FeedOutcome, "success">;

interface FeedAttempt {
  httpStatus: number | null;
  durationMs: number;
  errorMessage: string | null;
}

export interface UsableFeed extends FeedAttempt {
  outcome: "success";
  payloadDigest: string;
  stations: StationPayload[];
}

export interface UnusableFeed extends FeedAttempt {
  outcome: UnusableFeedOutcome;
}

export type FeedResult = UsableFeed | UnusableFeed;
