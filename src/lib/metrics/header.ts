import { databaseIsConfigured } from "@/lib/db/client";
import { loadNetworkSnapshot } from "./snapshot";

export async function loadLastSuccessfulPollAt(): Promise<string | null> {
  if (!databaseIsConfigured()) return null;

  try {
    const snapshot = await loadNetworkSnapshot();
    return snapshot.lastSuccessfulPollAt;
  } catch (error) {
    console.error("Header last-reading query failed", error);
    return null;
  }
}
