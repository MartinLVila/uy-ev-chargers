import { getStationStatuses } from "@/lib/metrics/queries";
import { readRoute } from "@/lib/api/read-route";
import { tokenGatedJsonResponse } from "@/lib/api/response";

export const dynamic = "force-dynamic";

export const GET = readRoute("Unable to read station data", async ({ db }) => {
  const stations = await getStationStatuses(db);
  return tokenGatedJsonResponse({ stations });
});
