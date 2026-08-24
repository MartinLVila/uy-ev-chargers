import { getDb } from "@/lib/db/client";
import { getDailyHistory } from "@/lib/metrics/queries";
import { parseWindowDays, windowFromDays } from "@/lib/metrics/window";
import { jsonResponse, errorResponse } from "@/lib/api/response";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const days = parseWindowDays(new URL(request.url).searchParams.get("days"));
  const window = windowFromDays(days);

  try {
    const series = await getDailyHistory(getDb(), window);
    return jsonResponse({ days, series });
  } catch {
    return errorResponse("Unable to read history", 503);
  }
}
