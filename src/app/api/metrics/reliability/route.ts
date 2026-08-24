import { getDb } from "@/lib/db/client";
import { getStationReliability } from "@/lib/metrics/queries";
import { parseWindowDays, windowFromDays } from "@/lib/metrics/window";
import { jsonResponse, errorResponse } from "@/lib/api/response";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const days = parseWindowDays(params.get("days"));
  const window = windowFromDays(days);
  const limit = Number.parseInt(params.get("limit") ?? "", 10);

  try {
    const stations = await getStationReliability(getDb(), window, {
      limit: Number.isFinite(limit) ? limit : undefined,
      worstFirst: params.get("sort") !== "name",
    });
    return jsonResponse({ days, stations });
  } catch {
    return errorResponse("Unable to read reliability data", 503);
  }
}
