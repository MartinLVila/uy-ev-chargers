import { getDb } from "@/lib/db/client";
import { getStationReliability } from "@/lib/metrics/queries";
import { parseWindowDays, windowFromDays } from "@/lib/metrics/window";
import { tokenGatedJsonResponse, loggedErrorResponse } from "@/lib/api/response";
import { rejectIfRateLimited, requestUnitsForWindow } from "@/lib/api/rate-limit";
import { rejectUnauthorizedRead } from "@/lib/api/authorization";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const days = parseWindowDays(params.get("days"));
  const window = windowFromDays(days);
  const limit = Number.parseInt(params.get("limit") ?? "", 10);

  const limited = await rejectIfRateLimited(request, "read", requestUnitsForWindow(days));
  if (limited) return limited;

  const unauthorized = rejectUnauthorizedRead(request);
  if (unauthorized) return unauthorized;

  try {
    const stations = await getStationReliability(getDb(), window, {
      limit: Number.isFinite(limit) ? limit : undefined,
      worstFirst: params.get("sort") !== "name",
    });
    return tokenGatedJsonResponse({ days, stations });
  } catch (error) {
    return loggedErrorResponse("GET /api/metrics/reliability", error, "Unable to read reliability data");
  }
}
