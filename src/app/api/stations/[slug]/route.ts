import { getDb } from "@/lib/db/client";
import { getStationDetail } from "@/lib/metrics/queries";
import { parseWindowDays, windowFromDays } from "@/lib/metrics/window";
import { errorResponse, jsonResponse, loggedErrorResponse } from "@/lib/api/response";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const days = parseWindowDays(new URL(request.url).searchParams.get("days"));

  try {
    const station = await getStationDetail(getDb(), slug, windowFromDays(days));
    if (!station) return errorResponse("Station not found", 404);
    return jsonResponse({ station });
  } catch (error) {
    return loggedErrorResponse("GET /api/stations/[slug]", error, "Unable to read station detail");
  }
}
