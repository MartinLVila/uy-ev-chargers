import {
  getConnectorTypeBreakdown,
  getDepartmentBreakdown,
  getFeedHealth,
  getNetworkSnapshot,
} from "@/lib/metrics/queries";
import { windowedReadRoute } from "@/lib/api/read-route";
import { tokenGatedJsonResponse } from "@/lib/api/response";

export const dynamic = "force-dynamic";

export const GET = windowedReadRoute("Unable to read metrics", async ({ db, window }) => {
  const [snapshot, feed, departments, connectorTypes] = await Promise.all([
    getNetworkSnapshot(db),
    getFeedHealth(db, window),
    getDepartmentBreakdown(db),
    getConnectorTypeBreakdown(db),
  ]);

  return tokenGatedJsonResponse({ snapshot, feed, departments, connectorTypes });
});
