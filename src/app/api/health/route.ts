import { getDb } from "@/lib/db/client";
import { checkSchema, describeMissing } from "@/lib/db/schema-check";
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
    const db = getDb();
    const schema = await checkSchema(db);

    if (!schema.matches) {
      const missing = describeMissing(schema.missing);
      console.error(`GET /api/health found the schema behind the code, missing ${missing}`);
      return tokenGatedJsonResponse(
        { status: "schema_behind", missing: schema.missing },
        { status: 503 },
      );
    }

    const snapshot = await getNetworkSnapshot(db);
    return tokenGatedJsonResponse({
      status: "ok",
      lastSuccessfulPollAt: snapshot.lastSuccessfulPollAt,
      stations: snapshot.stations.total,
    });
  } catch (error) {
    return loggedErrorResponse("GET /api/health", error, "Database unavailable");
  }
}
