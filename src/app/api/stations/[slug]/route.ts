import { getStationDetail } from "@/lib/metrics/queries";
import { windowedReadRoute } from "@/lib/api/read-route";
import { errorResponse, tokenGatedJsonResponse } from "@/lib/api/response";

export const dynamic = "force-dynamic";

export const GET = windowedReadRoute<{ slug: string }>(
  "Unable to read station detail",
  async ({ db, window, params }) => {
    const station = await getStationDetail(db, params.slug, window);
    if (!station) return errorResponse("Station not found", 404);
    return tokenGatedJsonResponse({ station });
  },
);
