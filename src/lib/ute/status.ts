import { fold } from "./normalize";

export type ConnectorHealth = "operational" | "faulted" | "absent" | "unknown";

export const ABSENT_STATUS = "Absent";

export const UNKNOWN_STATUS = "Unknown";

const OPERATIONAL = [
  "available",
  "busy",
  "charging",
  "preparing",
  "finishing",
  "occupied",
  "reserved",
  "suspendedev",
  "suspendedevse",
  "disponible",
  "cargando",
  "ocupado",
] as const;

const FAULTED = [
  "faulted",
  "unavailable",
  "outoforder",
  "out of order",
  "inoperative",
  "offline",
  "error",
  "fuera de servicio",
  "no disponible",
  "sin comunicacion",
  "sincomunicacion",
  "no communication",
  "nocomm",
  "no comm",
  "disconnected",
  "unavaliable",
] as const;

const OPERATIONAL_SET = new Set<string>(OPERATIONAL.map(fold));
const FAULTED_SET = new Set<string>(FAULTED.map(fold));
const ABSENT_KEY = fold(ABSENT_STATUS);

export function classifyConnectorHealth(statusDetail: string | null | undefined): ConnectorHealth {
  if (!statusDetail) return "unknown";
  const key = fold(statusDetail);
  if (key === ABSENT_KEY) return "absent";
  if (FAULTED_SET.has(key)) return "faulted";
  if (OPERATIONAL_SET.has(key)) return "operational";
  return "unknown";
}

export type StationPresence = "listed" | "silent" | "delisted";

export const STATION_PRESENCE = {
  listed: "listed",
  silent: "silent",
  delisted: "delisted",
} as const satisfies Record<StationPresence, StationPresence>;
