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

export const stationFeedEnvelopeSchema = z.object({
  data: z.array(z.unknown()),
  success: z.boolean().optional(),
  messages: z.array(z.unknown()).optional(),
  errors: z.array(z.unknown()).optional(),
  result: z.number().optional(),
});

export type StationPayload = z.infer<typeof stationPayloadSchema>;
