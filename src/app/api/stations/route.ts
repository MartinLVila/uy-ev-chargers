import { getDb } from "@/lib/db/client";
import { getStationStatuses } from "@/lib/metrics/queries";
import { jsonResponse, loggedErrorResponse } from "@/lib/api/response";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const stations = await getStationStatuses(getDb());
    return jsonResponse({ stations });
  } catch (error) {
    return loggedErrorResponse("GET /api/stations", error, "Unable to read station data");
  }
}
