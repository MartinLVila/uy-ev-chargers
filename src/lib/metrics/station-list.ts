import { databaseIsConfigured, getDb } from "@/lib/db/client";
import { getStationStatuses, type StationStatus } from "./queries";

export async function loadStationList(): Promise<StationStatus[]> {
  if (!databaseIsConfigured()) return [];

  try {
    return await getStationStatuses(getDb());
  } catch (error) {
    console.error("Station list query failed", error);
    return [];
  }
}
