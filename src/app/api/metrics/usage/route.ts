import { getUsageBreakdown, getHourlyUsage } from "@/lib/metrics/queries";
import { windowedReadRoute } from "@/lib/api/read-route";
import { tokenGatedJsonResponse } from "@/lib/api/response";

export const dynamic = "force-dynamic";

export const GET = windowedReadRoute("Unable to read usage", async ({ db, days, window }) => {
  const [usage, hourly] = await Promise.all([
    getUsageBreakdown(db, window),
    getHourlyUsage(db, window),
  ]);
  return tokenGatedJsonResponse({ days, usage, hourly });
});
