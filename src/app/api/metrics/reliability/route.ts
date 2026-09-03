import { getStationReliability } from "@/lib/metrics/queries";
import { windowedReadRoute } from "@/lib/api/read-route";
import { tokenGatedJsonResponse } from "@/lib/api/response";

export const dynamic = "force-dynamic";

export const GET = windowedReadRoute(
  "Unable to read reliability data",
  async ({ request, db, days, window }) => {
    const params = new URL(request.url).searchParams;
    const limit = Number.parseInt(params.get("limit") ?? "", 10);

    const stations = await getStationReliability(db, window, {
      limit: Number.isFinite(limit) ? limit : undefined,
      worstFirst: params.get("sort") !== "name",
    });

    return tokenGatedJsonResponse({ days, stations });
  },
);
