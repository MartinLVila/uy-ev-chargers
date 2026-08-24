import { getDb } from "@/lib/db/client";
import { getStationStatuses } from "@/lib/metrics/queries";
import { jsonResponse, errorResponse } from "@/lib/api/response";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const stations = await getStationStatuses(getDb());
    return jsonResponse({ stations });
  } catch {
    return errorResponse("Unable to read station data", 503);
  }
}
