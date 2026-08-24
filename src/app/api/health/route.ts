import { getDb } from "@/lib/db/client";
import { getNetworkSnapshot } from "@/lib/metrics/queries";
import { jsonResponse, errorResponse } from "@/lib/api/response";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const snapshot = await getNetworkSnapshot(getDb());
    return jsonResponse({
      status: "ok",
      lastSuccessfulPollAt: snapshot.lastSuccessfulPollAt,
      stations: snapshot.stations.total,
    });
  } catch {
    return errorResponse("Database unavailable", 503);
  }
}
