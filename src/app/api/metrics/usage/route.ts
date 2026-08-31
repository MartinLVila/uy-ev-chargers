import { getDb } from "@/lib/db/client";
import { getUsageBreakdown, getHourlyUsage } from "@/lib/metrics/queries";
import { parseWindowDays, windowFromDays } from "@/lib/metrics/window";
import { tokenGatedJsonResponse, loggedErrorResponse } from "@/lib/api/response";
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
    const [usage, hourly] = await Promise.all([
      getUsageBreakdown(db, window),
      getHourlyUsage(db, window),
    ]);
    return tokenGatedJsonResponse({ days, usage, hourly });
  } catch (error) {
    return loggedErrorResponse("GET /api/metrics/usage", error, "Unable to read usage");
  }
}
