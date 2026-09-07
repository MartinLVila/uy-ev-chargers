import { databaseIsConfigured, getDb } from "@/lib/db/client";
import { getNetworkSnapshot } from "./queries";

export async function loadLastSuccessfulPollAt(): Promise<string | null> {
  if (!databaseIsConfigured()) return null;

  try {
    const snapshot = await getNetworkSnapshot(getDb());
    return snapshot.lastSuccessfulPollAt;
  } catch (error) {
    console.error("Header last-reading query failed", error);
    return null;
  }
}
