import { getDb } from "@/lib/db/client";
import {
  getDailyHistory,
  getDepartmentBreakdown,
  getFeedHealth,
  getNetworkSnapshot,
  getStationReliability,
  getStationStatuses,
  type DailyPoint,
  type DepartmentBreakdown,
  type FeedHealth,
  type NetworkSnapshot,
  type StationReliability,
  type StationStatus,
} from "./queries";
import { windowFromDays } from "./window";

const RELIABILITY_DAYS = 30;

export interface DashboardData {
  snapshot: NetworkSnapshot;
  feed: FeedHealth;
  departments: DepartmentBreakdown[];
  stations: StationStatus[];
  reliability: StationReliability[];
  history: DailyPoint[];
  historyDays: number;
  reliabilityDays: number;
}

export async function loadDashboard(historyDays = 90): Promise<DashboardData | null> {
  try {
    const db = getDb();
    const window = windowFromDays(historyDays);

    const [snapshot, feed, departments, stations, reliability, history] = await Promise.all([
      getNetworkSnapshot(db),
      getFeedHealth(db, window),
      getDepartmentBreakdown(db),
      getStationStatuses(db),
      getStationReliability(db, windowFromDays(RELIABILITY_DAYS), {
        limit: 15,
        worstFirst: true,
      }),
      getDailyHistory(db, window),
    ]);

    return {
      snapshot,
      feed,
      departments,
      stations,
      reliability,
      history,
      historyDays,
      reliabilityDays: RELIABILITY_DAYS,
    };
  } catch (error) {
    console.error("Dashboard query failed", error);
    return null;
  }
}
