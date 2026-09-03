import { checkSchema, describeFaults } from "@/lib/db/schema-check";
import { getNetworkSnapshot } from "@/lib/metrics/queries";
import { readRoute } from "@/lib/api/read-route";
import { tokenGatedJsonResponse } from "@/lib/api/response";

export const dynamic = "force-dynamic";

let schemaAlreadyConfirmed = false;

export const GET = readRoute("Database unavailable", async ({ db }) => {
  if (!schemaAlreadyConfirmed) {
    const schema = await checkSchema(db);

    if (!schema.matches) {
      console.error(
        `GET /api/health found the schema behind the code: ${describeFaults(schema.faults)}`,
      );
      return tokenGatedJsonResponse(
        { status: "schema_behind", faults: schema.faults },
        { status: 503 },
      );
    }

    schemaAlreadyConfirmed = true;
  }

  const snapshot = await getNetworkSnapshot(db);
  return tokenGatedJsonResponse({
    status: "ok",
    lastSuccessfulPollAt: snapshot.lastSuccessfulPollAt,
    stations: snapshot.stations.total,
  });
});
