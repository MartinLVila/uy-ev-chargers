import { getDb } from "@/lib/db/client";
import {
  getConnectorTypeBreakdown,
  getDepartmentBreakdown,
  getFeedHealth,
  getNetworkSnapshot,
} from "@/lib/metrics/queries";
import { parseWindowDays, windowFromDays } from "@/lib/metrics/window";
import { jsonResponse, loggedErrorResponse } from "@/lib/api/response";
import { rejectIfRateLimited, requestUnitsForWindow } from "@/lib/api/rate-limit";
import { rejectUnauthorizedRead } from "@/lib/api/authorization";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const days = parseWindowDays(new URL(request.url).searchParams.get("days"));
  const window = windowFromDays(days);

  const limited = await rejectIfRateLimited(request, "read", requestUnitsForWindow(days));
  if (limited) return limited;

  const unauthorized = rejectUnauthorizedRead(request);
  if (unauthorized) return unauthorized;

  try {
    const db = getDb();
    const [snapshot, feed, departments, connectorTypes] = await Promise.all([
      getNetworkSnapshot(db),
      getFeedHealth(db, window),
      getDepartmentBreakdown(db),
      getConnectorTypeBreakdown(db),
    ]);

    return jsonResponse({ snapshot, feed, departments, connectorTypes });
  } catch (error) {
    return loggedErrorResponse("GET /api/metrics/overview", error, "Unable to read metrics");
  }
}
