import { getDb } from "@/lib/db/client";
import { getDailyHistory } from "@/lib/metrics/queries";
import { parseWindowDays, windowFromDays } from "@/lib/metrics/window";
import { jsonResponse, loggedErrorResponse } from "@/lib/api/response";
import { rejectIfRateLimited, requestUnitsForWindow } from "@/lib/api/rate-limit";
import { rejectUnauthorizedRead } from "@/lib/api/authorization";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const days = parseWindowDays(new URL(request.url).searchParams.get("days"));
  const window = windowFromDays(days);

  const unauthorized = rejectUnauthorizedRead(request);
  if (unauthorized) return unauthorized;

  const limited = await rejectIfRateLimited(request, "read", requestUnitsForWindow(days));
  if (limited) return limited;

  try {
    const series = await getDailyHistory(getDb(), window);
    return jsonResponse({ days, series });
  } catch (error) {
    return loggedErrorResponse("GET /api/metrics/history", error, "Unable to read history");
  }
}
