import { getDb } from "@/lib/db/client";
import {
  getConnectorTypeBreakdown,
  getDepartmentBreakdown,
  getFeedHealth,
  getNetworkSnapshot,
} from "@/lib/metrics/queries";
import { parseWindowDays, windowFromDays } from "@/lib/metrics/window";
import { jsonResponse, errorResponse } from "@/lib/api/response";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const days = parseWindowDays(new URL(request.url).searchParams.get("days"));
  const window = windowFromDays(days);
  const db = getDb();

  try {
    const [snapshot, feed, departments, connectorTypes] = await Promise.all([
      getNetworkSnapshot(db),
      getFeedHealth(db, window),
      getDepartmentBreakdown(db),
      getConnectorTypeBreakdown(db),
    ]);

    return jsonResponse({ snapshot, feed, departments, connectorTypes });
  } catch {
    return errorResponse("Unable to read metrics", 503);
  }
}
