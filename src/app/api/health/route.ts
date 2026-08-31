import { getDb } from "@/lib/db/client";
import { getNetworkSnapshot } from "@/lib/metrics/queries";
import { tokenGatedJsonResponse, loggedErrorResponse } from "@/lib/api/response";
import { rejectIfRateLimited } from "@/lib/api/rate-limit";
import { rejectUnauthorizedRead } from "@/lib/api/authorization";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const limited = await rejectIfRateLimited(request, "read");
  if (limited) return limited;

  const unauthorized = rejectUnauthorizedRead(request);
  if (unauthorized) return unauthorized;

  try {
    const snapshot = await getNetworkSnapshot(getDb());
    return tokenGatedJsonResponse({
      status: "ok",
      lastSuccessfulPollAt: snapshot.lastSuccessfulPollAt,
      stations: snapshot.stations.total,
    });
  } catch (error) {
    return loggedErrorResponse("GET /api/health", error, "Database unavailable");
  }
}
