import { getDb } from "@/lib/db/client";
import { getStationStatuses } from "@/lib/metrics/queries";
import { jsonResponse, loggedErrorResponse } from "@/lib/api/response";
import { rejectIfRateLimited } from "@/lib/api/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const limited = await rejectIfRateLimited(request, "read");
  if (limited) return limited;

  try {
    const stations = await getStationStatuses(getDb());
    return jsonResponse({ stations });
  } catch (error) {
    return loggedErrorResponse("GET /api/stations", error, "Unable to read station data");
  }
}
