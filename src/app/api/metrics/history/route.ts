import { getDailyHistory } from "@/lib/metrics/queries";
import { windowedReadRoute } from "@/lib/api/read-route";
import { tokenGatedJsonResponse } from "@/lib/api/response";

export const dynamic = "force-dynamic";

export const GET = windowedReadRoute("Unable to read history", async ({ db, days, window }) => {
  const series = await getDailyHistory(db, window);
  return tokenGatedJsonResponse({ days, series });
});
