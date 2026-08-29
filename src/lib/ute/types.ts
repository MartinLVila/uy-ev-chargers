import { z } from "zod";

export const connectorGroupPayloadSchema = z.object({
  count: z.number().int().nonnegative(),
  type: z.string().min(1),
  power: z.coerce.number().nonnegative(),
  status: z.number().int().nullable().optional(),
  statusDetail: z.string().nullable().optional(),
  hose: z.boolean().nullable().optional(),
});

export const stationPayloadSchema = z.object({
  source: z.string().nullable().optional(),
  name: z.string().min(1),
  address: z.string().nullable().optional(),
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  services: z.unknown().nullable().optional(),
  attendance: z.unknown().nullable().optional(),
  connectorStatusAcc: z.array(connectorGroupPayloadSchema).nullable().optional(),
  department: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  status: z.string().nullable().optional(),
});

export type StationPayload = z.infer<typeof stationPayloadSchema>;

export type FeedOutcome = "success" | "fetch_error" | "parse_error";

export interface FeedResult {
  outcome: FeedOutcome;
  httpStatus: number | null;
  durationMs: number;
  payloadDigest: string | null;
  stations: StationPayload[];
  rejectedStations: number;
  errorMessage: string | null;
}
