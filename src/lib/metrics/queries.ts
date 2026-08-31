import { sql, type SQL } from "drizzle-orm";
import type { TimeWindow } from "./window";
import { FREE_STATUS_KEYS } from "../ute/status";

export interface SqlRunner {
  execute<T extends Record<string, unknown>>(query: SQL): Promise<{ rows: T[] }>;
}

const OUT_OF_SERVICE = sql`('faulted', 'absent')`;

const TELEMETRY = sql`cs.health IN ('operational', 'faulted')`;
const FREE_DETAIL = sql`cs.status_detail_key IN (${sql.join(
  FREE_STATUS_KEYS.map((value) => sql`${value}`),
  sql`, `,
)})`;
const IN_USE = sql`cs.health = 'operational' AND NOT (${FREE_DETAIL})`;

const SLOT_SECONDS = sql`EXTRACT(EPOCH FROM (cs.slot_to - cs.slot_from))`;

function overlapSeconds(alias: string, window: TimeWindow): SQL {
  const started = sql.raw(`${alias}.started_at`);
  const ended = sql.raw(`${alias}.ended_at`);
  return sql`GREATEST(
    0,
    EXTRACT(EPOCH FROM (
      LEAST(COALESCE(${ended}, ${window.to}::timestamptz), ${window.to}::timestamptz)
      - GREATEST(${started}, ${window.from}::timestamptz)
    ))
  )`;
}

function dailyOverlapSeconds(alias: string): SQL {
  const started = sql.raw(`${alias}.started_at`);
  const ended = sql.raw(`${alias}.ended_at`);
  return sql`GREATEST(
    0,
    EXTRACT(EPOCH FROM (
      LEAST(COALESCE(${ended}, b.to_at), b.to_at) - GREATEST(${started}, b.from_at)
    ))
  )`;
}

function overlapsWindow(alias: string, window: TimeWindow): SQL {
  const started = sql.raw(`${alias}.started_at`);
  const ended = sql.raw(`${alias}.ended_at`);
  return sql`${started} < ${window.to}::timestamptz
    AND (${ended} IS NULL OR ${ended} > ${window.from}::timestamptz)`;
}

export interface NetworkSnapshot {
  lastSuccessfulPollAt: string | null;
  stations: {
    total: number;
    listed: number;
    silent: number;
    delisted: number;
  };
  connectors: {
    reported: number;
    operational: number;
    faulted: number;
    unknown: number;
    absent: number;
    outOfService: number;
  };
}

export async function getNetworkSnapshot(db: SqlRunner): Promise<NetworkSnapshot> {
  const { rows } = await db.execute<{
    last_poll: Date | string | null;
    stations_total: number;
    stations_listed: number;
    stations_silent: number;
    stations_delisted: number;
    connectors_reported: number;
    connectors_operational: number;
    connectors_faulted: number;
    connectors_unknown: number;
    connectors_absent: number;
  }>(sql`
    WITH current_station AS (
      SELECT station_id, state FROM station_states WHERE ended_at IS NULL
    ),
    current_connector AS (
      SELECT cs.health, cs.connector_count
      FROM connector_states cs
      WHERE cs.ended_at IS NULL
    )
    SELECT
      (SELECT MAX(started_at) FROM poll_runs WHERE outcome = 'success') AS last_poll,
      (SELECT COUNT(*) FROM current_station) AS stations_total,
      (SELECT COUNT(*) FROM current_station WHERE state = 'listed') AS stations_listed,
      (SELECT COUNT(*) FROM current_station WHERE state = 'silent') AS stations_silent,
      (SELECT COUNT(*) FROM current_station WHERE state = 'delisted') AS stations_delisted,
      (SELECT COALESCE(SUM(connector_count), 0) FROM current_connector WHERE health <> 'absent')
        AS connectors_reported,
      (SELECT COALESCE(SUM(connector_count), 0) FROM current_connector WHERE health = 'operational')
        AS connectors_operational,
      (SELECT COALESCE(SUM(connector_count), 0) FROM current_connector WHERE health = 'faulted')
        AS connectors_faulted,
      (SELECT COALESCE(SUM(connector_count), 0) FROM current_connector WHERE health = 'unknown')
        AS connectors_unknown,
      (SELECT COALESCE(SUM(connector_count), 0) FROM current_connector WHERE health = 'absent')
        AS connectors_absent
  `);

  const row = rows[0];
  const faulted = toNumber(row?.connectors_faulted);
  const absent = toNumber(row?.connectors_absent);

  return {
    lastSuccessfulPollAt: toIsoString(row?.last_poll ?? null),
    stations: {
      total: toNumber(row?.stations_total),
      listed: toNumber(row?.stations_listed),
      silent: toNumber(row?.stations_silent),
      delisted: toNumber(row?.stations_delisted),
    },
    connectors: {
      reported: toNumber(row?.connectors_reported),
      operational: toNumber(row?.connectors_operational),
      faulted,
      unknown: toNumber(row?.connectors_unknown),
      absent,
      outOfService: faulted + absent,
    },
  };
}

export interface DepartmentBreakdown {
  department: string;
  stations: number;
  connectors: number;
  operational: number;
  faulted: number;
  absent: number;
  outOfService: number;
}

export async function getDepartmentBreakdown(db: SqlRunner): Promise<DepartmentBreakdown[]> {
  const { rows } = await db.execute<{
    department: string;
    stations: number;
    connectors: number;
    operational: number;
    faulted: number;
    absent: number;
  }>(sql`
    SELECT
      st.department AS department,
      COUNT(DISTINCT st.id) AS stations,
      COALESCE(SUM(cs.connector_count) FILTER (WHERE cs.health <> 'absent'), 0) AS connectors,
      COALESCE(SUM(cs.connector_count) FILTER (WHERE cs.health = 'operational'), 0) AS operational,
      COALESCE(SUM(cs.connector_count) FILTER (WHERE cs.health = 'faulted'), 0) AS faulted,
      COALESCE(SUM(cs.connector_count) FILTER (WHERE cs.health = 'absent'), 0) AS absent
    FROM stations st
    LEFT JOIN connector_groups cg ON cg.station_id = st.id
    LEFT JOIN connector_states cs ON cs.connector_group_id = cg.id AND cs.ended_at IS NULL
    GROUP BY st.department
    ORDER BY connectors DESC, st.department ASC
  `);

  return rows.map((row) => {
    const faulted = toNumber(row.faulted);
    const absent = toNumber(row.absent);
    return {
      department: row.department,
      stations: toNumber(row.stations),
      connectors: toNumber(row.connectors),
      operational: toNumber(row.operational),
      faulted,
      absent,
      outOfService: faulted + absent,
    };
  });
}

export interface ConnectorTypeBreakdown {
  connectorType: string;
  powerKw: number;
  connectors: number;
  faulted: number;
  absent: number;
  outOfService: number;
}

export async function getConnectorTypeBreakdown(db: SqlRunner): Promise<ConnectorTypeBreakdown[]> {
  const { rows } = await db.execute<{
    connector_type: string;
    power_kw: number;
    connectors: number;
    faulted: number;
    absent: number;
  }>(sql`
    SELECT
      cg.connector_type,
      cg.power_kw,
      COALESCE(SUM(cs.connector_count) FILTER (WHERE cs.health <> 'absent'), 0) AS connectors,
      COALESCE(SUM(cs.connector_count) FILTER (WHERE cs.health = 'faulted'), 0) AS faulted,
      COALESCE(SUM(cs.connector_count) FILTER (WHERE cs.health = 'absent'), 0) AS absent
    FROM connector_groups cg
    LEFT JOIN connector_states cs ON cs.connector_group_id = cg.id AND cs.ended_at IS NULL
    GROUP BY cg.connector_type, cg.power_kw
    ORDER BY connectors DESC, cg.connector_type ASC
  `);

  return rows.map((row) => {
    const faulted = toNumber(row.faulted);
    const absent = toNumber(row.absent);
    return {
      connectorType: row.connector_type,
      powerKw: toNumber(row.power_kw),
      connectors: toNumber(row.connectors),
      faulted,
      absent,
      outOfService: faulted + absent,
    };
  });
}

export interface StationStatus {
  slug: string;
  name: string;
  address: string | null;
  city: string | null;
  department: string;
  latitude: number;
  longitude: number;
  presence: string;
  connectors: number;
  operational: number;
  faulted: number;
  unknown: number;
  absent: number;
  outOfService: number;
  lastSeenAt: string;
}

export async function getStationStatuses(db: SqlRunner): Promise<StationStatus[]> {
  const { rows } = await db.execute<{
    slug: string;
    name: string;
    address: string | null;
    city: string | null;
    department: string;
    latitude: number;
    longitude: number;
    presence: string | null;
    connectors: number;
    operational: number;
    faulted: number;
    unknown_count: number;
    absent: number;
    last_seen_at: Date | string;
  }>(sql`
    SELECT
      st.slug, st.name, st.address, st.city, st.department,
      st.latitude, st.longitude, st.last_seen_at,
      (SELECT state FROM station_states WHERE station_id = st.id AND ended_at IS NULL LIMIT 1)
        AS presence,
      COALESCE(SUM(cs.connector_count) FILTER (WHERE cs.health <> 'absent'), 0) AS connectors,
      COALESCE(SUM(cs.connector_count) FILTER (WHERE cs.health = 'operational'), 0) AS operational,
      COALESCE(SUM(cs.connector_count) FILTER (WHERE cs.health = 'faulted'), 0) AS faulted,
      COALESCE(SUM(cs.connector_count) FILTER (WHERE cs.health = 'unknown'), 0) AS unknown_count,
      COALESCE(SUM(cs.connector_count) FILTER (WHERE cs.health = 'absent'), 0) AS absent
    FROM stations st
    LEFT JOIN connector_groups cg ON cg.station_id = st.id
    LEFT JOIN connector_states cs ON cs.connector_group_id = cg.id AND cs.ended_at IS NULL
    GROUP BY st.id, st.slug, st.name, st.address, st.city, st.department,
             st.latitude, st.longitude, st.last_seen_at
    ORDER BY st.name ASC
  `);

  return rows.map((row) => {
    const faulted = toNumber(row.faulted);
    const absent = toNumber(row.absent);
    return {
      slug: row.slug,
      name: row.name,
      address: row.address,
      city: row.city,
      department: row.department,
      latitude: toNumber(row.latitude),
      longitude: toNumber(row.longitude),
      presence: row.presence ?? "unknown",
      connectors: toNumber(row.connectors),
      operational: toNumber(row.operational),
      faulted,
      unknown: toNumber(row.unknown_count),
      absent,
      outOfService: faulted + absent,
      lastSeenAt: toIsoString(row.last_seen_at) ?? "",
    };
  });
}

export interface FeedHealth {
  windowDays: number;
  polls: number;
  successes: number;
  failures: number;
  successRate: number;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  distinctPayloads: number;
  identicalPayloadStreak: number;
  unchangedSince: string | null;
}

export async function getFeedHealth(db: SqlRunner, window: TimeWindow): Promise<FeedHealth> {
  const { rows } = await db.execute<{
    polls: number;
    successes: number;
    last_success: Date | string | null;
    last_failure: Date | string | null;
    distinct_payloads: number;
  }>(sql`
    SELECT
      COUNT(*) AS polls,
      COUNT(*) FILTER (WHERE outcome = 'success') AS successes,
      MAX(started_at) FILTER (WHERE outcome = 'success') AS last_success,
      MAX(started_at) FILTER (WHERE outcome <> 'success') AS last_failure,
      COUNT(DISTINCT payload_digest) FILTER (WHERE outcome = 'success') AS distinct_payloads
    FROM poll_runs
    WHERE started_at >= ${window.from}::timestamptz AND started_at <= ${window.to}::timestamptz
  `);

  const streak = await db.execute<{ streak: number; unchanged_since: Date | string | null }>(sql`
    WITH ordered AS (
      SELECT payload_digest, started_at, ROW_NUMBER() OVER (ORDER BY started_at DESC) AS rn
      FROM poll_runs
      WHERE outcome = 'success'
        AND payload_digest IS NOT NULL
        AND started_at >= ${window.from}::timestamptz
        AND started_at <= ${window.to}::timestamptz
    ),
    latest AS (SELECT payload_digest FROM ordered WHERE rn = 1),
    first_change AS (
      SELECT MIN(rn) AS rn
      FROM ordered
      WHERE payload_digest IS DISTINCT FROM (SELECT payload_digest FROM latest)
    )
    SELECT
      COALESCE(
        (SELECT rn - 1 FROM first_change WHERE rn IS NOT NULL),
        (SELECT COUNT(*) FROM ordered)
      ) AS streak,
      (
        SELECT MIN(started_at) FROM ordered
        WHERE rn <= COALESCE(
          (SELECT rn - 1 FROM first_change WHERE rn IS NOT NULL),
          (SELECT COUNT(*) FROM ordered)
        )
      ) AS unchanged_since
  `);

  const row = rows[0];
  const polls = toNumber(row?.polls);
  const successes = toNumber(row?.successes);
  const streakRow = streak.rows[0];
  const streakCount = toNumber(streakRow?.streak);

  return {
    windowDays: Math.round((window.to.getTime() - window.from.getTime()) / 86_400_000),
    polls,
    successes,
    failures: polls - successes,
    successRate: polls > 0 ? successes / polls : 0,
    lastSuccessAt: toIsoString(row?.last_success ?? null),
    lastFailureAt: toIsoString(row?.last_failure ?? null),
    distinctPayloads: toNumber(row?.distinct_payloads),
    identicalPayloadStreak: streakCount,
    unchangedSince: streakCount > 1 ? toIsoString(streakRow?.unchanged_since ?? null) : null,
  };
}

export interface StationReliability {
  slug: string;
  name: string;
  department: string;
  city: string | null;
  latitude: number;
  longitude: number;
  connectorSeconds: number;
  unknownSeconds: number;
  outOfServiceSeconds: number;
  availability: number | null;
  currentlyOutOfService: number;
}

export async function getStationReliability(
  db: SqlRunner,
  window: TimeWindow,
  options: { limit?: number; worstFirst?: boolean } = {},
): Promise<StationReliability[]> {
  const limit = Math.min(Math.max(options.limit ?? 250, 1), 1000);
  const order = options.worstFirst
    ? sql`availability ASC NULLS LAST, totals.out_of_service_seconds DESC`
    : sql`totals.name ASC`;

  const { rows } = await db.execute<{
    slug: string;
    name: string;
    department: string;
    city: string | null;
    latitude: number;
    longitude: number;
    connector_seconds: number;
    unknown_seconds: number;
    out_of_service_seconds: number;
    availability: number | null;
    currently_out_of_service: number;
  }>(sql`
    SELECT
      totals.*,
      CASE
        WHEN totals.classified_seconds = 0 THEN NULL
        ELSE 1 - (totals.out_of_service_seconds / totals.classified_seconds)
      END AS availability
    FROM (
      SELECT
        st.slug,
        st.name,
        st.department,
        st.city,
        st.latitude,
        st.longitude,
        COALESCE(SUM(cs.connector_count * ${overlapSeconds("cs", window)}), 0) AS connector_seconds,
        COALESCE(
          SUM(cs.connector_count * ${overlapSeconds("cs", window)})
            FILTER (WHERE cs.health <> 'unknown'),
          0
        ) AS classified_seconds,
        COALESCE(
          SUM(cs.connector_count * ${overlapSeconds("cs", window)})
            FILTER (WHERE cs.health = 'unknown'),
          0
        ) AS unknown_seconds,
        COALESCE(
          SUM(cs.connector_count * ${overlapSeconds("cs", window)})
            FILTER (WHERE cs.health IN ${OUT_OF_SERVICE}),
          0
        ) AS out_of_service_seconds,
        COALESCE(
          SUM(cs.connector_count)
            FILTER (WHERE cs.ended_at IS NULL AND cs.health IN ${OUT_OF_SERVICE}),
          0
        ) AS currently_out_of_service
      FROM stations st
      JOIN connector_groups cg ON cg.station_id = st.id
      JOIN connector_states cs ON cs.connector_group_id = cg.id
      WHERE ${overlapsWindow("cs", window)}
      GROUP BY st.id, st.slug, st.name, st.department, st.city, st.latitude, st.longitude
    ) totals
    ORDER BY ${order}
    LIMIT ${limit}
  `);

  return rows.map((row) => ({
    slug: row.slug,
    name: row.name,
    department: row.department,
    city: row.city,
    latitude: toNumber(row.latitude),
    longitude: toNumber(row.longitude),
    connectorSeconds: toNumber(row.connector_seconds),
    unknownSeconds: toNumber(row.unknown_seconds),
    outOfServiceSeconds: toNumber(row.out_of_service_seconds),
    availability: toNullableNumber(row.availability),
    currentlyOutOfService: toNumber(row.currently_out_of_service),
  }));
}

export interface DailyPoint {
  day: string;
  connectorsTracked: number;
  connectorsAbsent: number;
  connectorsOutOfService: number;
  outOfServiceRatio: number;
  stationsDelisted: number;
}

export const REPORTING_TIME_ZONE = "America/Montevideo";

export async function getDailyHistory(
  db: SqlRunner,
  window: TimeWindow,
  timeZone: string = REPORTING_TIME_ZONE,
): Promise<DailyPoint[]> {
  const { rows } = await db.execute<{
    day: string;
    connectors_tracked: number;
    connectors_absent: number;
    connectors_out: number;
    stations_delisted: number;
  }>(sql`
    WITH days AS (
      SELECT generate_series(
        date_trunc('day', ${window.from}::timestamptz AT TIME ZONE ${timeZone}),
        date_trunc('day', ${window.to}::timestamptz AT TIME ZONE ${timeZone}),
        interval '1 day'
      ) AS local_day
    ),
    bounds AS (
      SELECT day, from_at, to_at, EXTRACT(EPOCH FROM (to_at - from_at)) AS span
      FROM (
        SELECT
          to_char(local_day, 'YYYY-MM-DD') AS day,
          GREATEST(local_day AT TIME ZONE ${timeZone}, ${window.from}::timestamptz) AS from_at,
          LEAST(
            (local_day + interval '1 day') AT TIME ZONE ${timeZone},
            ${window.to}::timestamptz
          ) AS to_at
        FROM days
      ) framed
      WHERE to_at > from_at
    ),
    connector_daily AS (
      SELECT
        b.day,
        SUM(cs.connector_count * ${dailyOverlapSeconds("cs")})
          FILTER (WHERE cs.health <> 'absent') / NULLIF(MAX(b.span), 0) AS connectors_tracked,
        SUM(cs.connector_count * ${dailyOverlapSeconds("cs")})
          FILTER (WHERE cs.health = 'absent') / NULLIF(MAX(b.span), 0) AS connectors_absent,
        SUM(cs.connector_count * ${dailyOverlapSeconds("cs")})
          FILTER (WHERE cs.health IN ${OUT_OF_SERVICE}) / NULLIF(MAX(b.span), 0) AS connectors_out
      FROM bounds b
      JOIN connector_states cs
        ON cs.started_at < b.to_at AND (cs.ended_at IS NULL OR cs.ended_at > b.from_at)
      GROUP BY b.day
    ),
    station_daily AS (
      SELECT
        b.day,
        SUM(${dailyOverlapSeconds("ss")}) / NULLIF(MAX(b.span), 0) AS stations_delisted
      FROM bounds b
      JOIN station_states ss
        ON ss.state = 'delisted'
        AND ss.started_at < b.to_at
        AND (ss.ended_at IS NULL OR ss.ended_at > b.from_at)
      GROUP BY b.day
    )
    SELECT
      cd.day,
      COALESCE(cd.connectors_tracked, 0) AS connectors_tracked,
      COALESCE(cd.connectors_absent, 0) AS connectors_absent,
      COALESCE(cd.connectors_out, 0) AS connectors_out,
      COALESCE(sd.stations_delisted, 0) AS stations_delisted
    FROM connector_daily cd
    LEFT JOIN station_daily sd ON sd.day = cd.day
    ORDER BY cd.day ASC
  `);

  return rows.map((row) => {
    const tracked = toNumber(row.connectors_tracked);
    const absent = toNumber(row.connectors_absent);
    const out = toNumber(row.connectors_out);
    const fleet = tracked + absent;
    return {
      day: row.day,
      connectorsTracked: round(tracked, 2),
      connectorsAbsent: round(absent, 2),
      connectorsOutOfService: round(out, 2),
      outOfServiceRatio: fleet > 0 ? round(out / fleet, 4) : 0,
      stationsDelisted: round(toNumber(row.stations_delisted), 2),
    };
  });
}

const TIMELINE_LIMIT_PER_GROUP = 150;

export interface StationTimelineEntry {
  connectorType: string;
  powerKw: number;
  hasCable: boolean;
  statusDetail: string;
  health: string;
  connectorCount: number;
  startedAt: string;
  endedAt: string | null;
}

export interface StationDetail {
  slug: string;
  name: string;
  address: string | null;
  city: string | null;
  department: string;
  latitude: number;
  longitude: number;
  firstSeenAt: string;
  lastSeenAt: string;
  presence: string;
  timeline: StationTimelineEntry[];
  timelineTruncated: boolean;
  timelineCoversFrom: string | null;
}

export async function getStationDetail(
  db: SqlRunner,
  slug: string,
  window: TimeWindow,
): Promise<StationDetail | null> {
  const { rows: stationRows } = await db.execute<{
    slug: string;
    name: string;
    address: string | null;
    city: string | null;
    department: string;
    latitude: number;
    longitude: number;
    first_seen_at: Date | string;
    last_seen_at: Date | string;
    presence: string | null;
  }>(sql`
    SELECT
      st.slug, st.name, st.address, st.city, st.department,
      st.latitude, st.longitude, st.first_seen_at, st.last_seen_at,
      (SELECT state FROM station_states WHERE station_id = st.id AND ended_at IS NULL LIMIT 1)
        AS presence
    FROM stations st
    WHERE st.slug = ${slug}
    LIMIT 1
  `);

  const station = stationRows[0];
  if (!station) return null;

  const { rows: timelineRows } = await db.execute<{
    connector_group_id: number;
    connector_type: string;
    power_kw: number;
    has_cable: boolean;
    status_detail: string;
    health: string;
    connector_count: number;
    started_at: Date | string;
    ended_at: Date | string | null;
    rank_in_group: number;
  }>(sql`
    SELECT * FROM (
      SELECT
        cg.id AS connector_group_id,
        cg.connector_type, cg.power_kw, cg.has_cable,
        cs.status_detail, cs.health, cs.connector_count, cs.started_at, cs.ended_at,
        ROW_NUMBER() OVER (PARTITION BY cg.id ORDER BY cs.started_at DESC) AS rank_in_group
      FROM connector_states cs
      JOIN connector_groups cg ON cg.id = cs.connector_group_id
      JOIN stations st ON st.id = cg.station_id
      WHERE st.slug = ${slug} AND ${overlapsWindow("cs", window)}
    ) ranked
    WHERE rank_in_group <= ${TIMELINE_LIMIT_PER_GROUP + 1}
    ORDER BY started_at DESC, connector_type ASC
  `);

  const retained = timelineRows.filter(
    (row) => toNumber(row.rank_in_group) <= TIMELINE_LIMIT_PER_GROUP,
  );
  const coverage = timelineCoverage(timelineRows, retained);

  return {
    slug: station.slug,
    name: station.name,
    address: station.address,
    city: station.city,
    department: station.department,
    latitude: toNumber(station.latitude),
    longitude: toNumber(station.longitude),
    firstSeenAt: toIsoString(station.first_seen_at) ?? "",
    lastSeenAt: toIsoString(station.last_seen_at) ?? "",
    presence: station.presence ?? "unknown",
    timelineTruncated: coverage.truncated,
    timelineCoversFrom: coverage.coversFrom,
    timeline: retained.map((row) => ({
      connectorType: row.connector_type,
      powerKw: toNumber(row.power_kw),
      hasCable: Boolean(row.has_cable),
      statusDetail: row.status_detail,
      health: row.health,
      connectorCount: toNumber(row.connector_count),
      startedAt: toIsoString(row.started_at) ?? "",
      endedAt: toIsoString(row.ended_at),
    })),
  };
}

interface TimelineCoverage {
  truncated: boolean;
  coversFrom: string | null;
}

function timelineCoverage(
  allRows: { connector_group_id: number; rank_in_group: number }[],
  retained: { connector_group_id: number; started_at: Date | string }[],
): TimelineCoverage {
  const truncatedGroups = new Set(
    allRows
      .filter((row) => toNumber(row.rank_in_group) > TIMELINE_LIMIT_PER_GROUP)
      .map((row) => row.connector_group_id),
  );

  if (truncatedGroups.size === 0) return { truncated: false, coversFrom: null };

  let latestCutoff = Number.NEGATIVE_INFINITY;
  for (const groupId of truncatedGroups) {
    const oldestKept = retained
      .filter((row) => row.connector_group_id === groupId)
      .reduce((oldest, row) => {
        const startedAt = new Date(row.started_at).getTime();
        return Number.isFinite(startedAt) && startedAt < oldest ? startedAt : oldest;
      }, Number.POSITIVE_INFINITY);

    if (Number.isFinite(oldestKept) && oldestKept > latestCutoff) latestCutoff = oldestKept;
  }

  return {
    truncated: true,
    coversFrom: Number.isFinite(latestCutoff) ? new Date(latestCutoff).toISOString() : null,
  };
}

export interface UsageBreakdown {
  windowDays: number;
  connectorHours: { free: number; inUse: number; broken: number };
  share: { free: number; inUse: number; broken: number };
  utilization: number;
  byType: Array<{
    type: string;
    powerKw: number;
    connectorHours: number;
    utilization: number;
    brokenShare: number;
  }>;
}

export async function getUsageBreakdown(
  db: SqlRunner,
  window: TimeWindow,
): Promise<UsageBreakdown> {
  const windowDays = Math.round((window.to.getTime() - window.from.getTime()) / 86_400_000);
  const secs = sql`cs.connector_count * ${overlapSeconds("cs", window)}`;

  const { rows: totals } = await db.execute<{
    free_secs: number;
    in_use_secs: number;
    broken_secs: number;
  }>(sql`
    SELECT
      COALESCE(SUM(${secs}) FILTER (WHERE ${FREE_DETAIL}), 0) AS free_secs,
      COALESCE(SUM(${secs}) FILTER (WHERE ${IN_USE}), 0) AS in_use_secs,
      COALESCE(SUM(${secs}) FILTER (WHERE cs.health = 'faulted'), 0) AS broken_secs
    FROM connector_states cs
    WHERE ${overlapsWindow("cs", window)} AND ${TELEMETRY}
  `);

  const { rows: byType } = await db.execute<{
    connector_type: string;
    power_kw: number;
    free_secs: number;
    in_use_secs: number;
    broken_secs: number;
  }>(sql`
    SELECT
      cg.connector_type,
      cg.power_kw,
      COALESCE(SUM(${secs}) FILTER (WHERE ${FREE_DETAIL}), 0) AS free_secs,
      COALESCE(SUM(${secs}) FILTER (WHERE ${IN_USE}), 0) AS in_use_secs,
      COALESCE(SUM(${secs}) FILTER (WHERE cs.health = 'faulted'), 0) AS broken_secs
    FROM connector_states cs
    JOIN connector_groups cg ON cg.id = cs.connector_group_id
    WHERE ${overlapsWindow("cs", window)} AND ${TELEMETRY}
    GROUP BY cg.connector_type, cg.power_kw
    ORDER BY SUM(${secs}) DESC
  `);

  const hours = (value: number) => round(value / 3600, 1);
  const frac = (numerator: number, denominator: number) =>
    denominator > 0 ? round(numerator / denominator, 4) : 0;

  const total = totals[0];
  const free = toNumber(total?.free_secs);
  const inUse = toNumber(total?.in_use_secs);
  const broken = toNumber(total?.broken_secs);
  const grand = free + inUse + broken;

  return {
    windowDays,
    connectorHours: { free: hours(free), inUse: hours(inUse), broken: hours(broken) },
    share: { free: frac(free, grand), inUse: frac(inUse, grand), broken: frac(broken, grand) },
    utilization: frac(inUse, free + inUse),
    byType: byType.map((row) => {
      const f = toNumber(row.free_secs);
      const u = toNumber(row.in_use_secs);
      const b = toNumber(row.broken_secs);
      return {
        type: row.connector_type,
        powerKw: toNumber(row.power_kw),
        connectorHours: hours(f + u + b),
        utilization: frac(u, f + u),
        brokenShare: frac(b, f + u + b),
      };
    }),
  };
}

export interface HourlyUsagePoint {
  hour: number;
  utilization: number;
  brokenShare: number;
  sampleHours: number;
}

export async function getHourlyUsage(
  db: SqlRunner,
  window: TimeWindow,
  timeZone: string = REPORTING_TIME_ZONE,
): Promise<HourlyUsagePoint[]> {
  const { rows } = await db.execute<{
    hour: number;
    in_use_secs: number;
    free_secs: number;
    broken_secs: number;
    span_secs: number;
  }>(sql`
    WITH clipped AS (
      SELECT
        cs.connector_count,
        cs.health,
        cs.status_detail_key,
        GREATEST(cs.started_at, ${window.from}::timestamptz) AS started_at,
        LEAST(COALESCE(cs.ended_at, ${window.to}::timestamptz), ${window.to}::timestamptz)
          AS ended_at
      FROM connector_states cs
      WHERE ${overlapsWindow("cs", window)} AND ${TELEMETRY}
    ),
    sliced AS (
      SELECT
        clipped.connector_count,
        clipped.health,
        clipped.status_detail_key,
        slot.local_hour,
        EXTRACT(EPOCH FROM (
          LEAST(clipped.ended_at, (slot.local_hour + interval '1 hour') AT TIME ZONE ${timeZone})
          - GREATEST(clipped.started_at, slot.local_hour AT TIME ZONE ${timeZone})
        )) AS seconds
      FROM clipped
      CROSS JOIN LATERAL generate_series(
        date_trunc('hour', clipped.started_at AT TIME ZONE ${timeZone}),
        date_trunc('hour', clipped.ended_at AT TIME ZONE ${timeZone}),
        interval '1 hour'
      ) AS slot(local_hour)
    ),
    coverage AS (
      SELECT
        EXTRACT(HOUR FROM local_hour)::int AS hour,
        SUM(EXTRACT(EPOCH FROM (
          LEAST((local_hour + interval '1 hour') AT TIME ZONE ${timeZone}, ${window.to}::timestamptz)
          - GREATEST(local_hour AT TIME ZONE ${timeZone}, ${window.from}::timestamptz)
        ))) AS span_secs
      FROM (SELECT DISTINCT local_hour FROM sliced) covered
      GROUP BY 1
    )
    SELECT
      EXTRACT(HOUR FROM cs.local_hour)::int AS hour,
      COALESCE(SUM(cs.connector_count * cs.seconds) FILTER (WHERE ${IN_USE}), 0) AS in_use_secs,
      COALESCE(SUM(cs.connector_count * cs.seconds) FILTER (WHERE ${FREE_DETAIL}), 0) AS free_secs,
      COALESCE(SUM(cs.connector_count * cs.seconds) FILTER (WHERE cs.health = 'faulted'), 0)
        AS broken_secs,
      MAX(coverage.span_secs) AS span_secs
    FROM sliced cs
    JOIN coverage ON coverage.hour = EXTRACT(HOUR FROM cs.local_hour)::int
    WHERE cs.seconds > 0
    GROUP BY 1
    ORDER BY 1
  `);

  return rows.map((row) => {
    const inUse = toNumber(row.in_use_secs);
    const free = toNumber(row.free_secs);
    const broken = toNumber(row.broken_secs);
    return {
      hour: toNumber(row.hour),
      utilization: free + inUse > 0 ? round(inUse / (free + inUse), 4) : 0,
      brokenShare: free + inUse + broken > 0 ? round(broken / (free + inUse + broken), 4) : 0,
      sampleHours: round(toNumber(row.span_secs) / 3600, 1),
    };
  });
}

function toNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  return toNumber(value);
}

function toIsoString(value: Date | string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export interface StationHourlyUsagePoint {
  hour: number;
  utilization: number;
  brokenShare: number;
  observedHours: number;
}

export interface ConnectorGroupHourlyUsage {
  connectorGroupId: number;
  connectorType: string;
  powerKw: number;
  hasCable: boolean;
  connectorCount: number | null;
  hours: StationHourlyUsagePoint[];
}

export async function getStationHourlyUsage(
  db: SqlRunner,
  slug: string,
  window: TimeWindow,
  timeZone: string = REPORTING_TIME_ZONE,
): Promise<ConnectorGroupHourlyUsage[]> {
  const { rows } = await db.execute<{
    connector_group_id: number;
    connector_type: string;
    power_kw: string | number;
    has_cable: boolean;
    connector_count: string | number | null;
    hour: number;
    in_use_secs: string | number;
    free_secs: string | number;
    broken_secs: string | number;
    observed_secs: string | number;
  }>(sql`
    WITH clipped AS (
      SELECT
        cs.connector_group_id,
        cs.connector_count,
        cs.health,
        cs.status_detail_key,
        GREATEST(cs.started_at, ${window.from}::timestamptz) AS started_at,
        LEAST(COALESCE(cs.ended_at, ${window.to}::timestamptz), ${window.to}::timestamptz)
          AS ended_at
      FROM connector_states cs
      JOIN connector_groups g ON g.id = cs.connector_group_id
      JOIN stations st ON st.id = g.station_id
      WHERE st.slug = ${slug} AND ${overlapsWindow("cs", window)} AND ${TELEMETRY}
    ),
    sliced AS (
      SELECT
        clipped.connector_group_id,
        clipped.connector_count,
        clipped.health,
        clipped.status_detail_key,
        slot.local_hour,
        EXTRACT(HOUR FROM slot.local_hour)::int AS hour,
        GREATEST(clipped.started_at, slot.local_hour AT TIME ZONE ${timeZone}) AS slot_from,
        LEAST(clipped.ended_at, (slot.local_hour + interval '1 hour') AT TIME ZONE ${timeZone})
          AS slot_to
      FROM clipped
      CROSS JOIN LATERAL generate_series(
        date_trunc('hour', clipped.started_at AT TIME ZONE ${timeZone}),
        date_trunc('hour', clipped.ended_at AT TIME ZONE ${timeZone}),
        interval '1 hour'
      ) AS slot(local_hour)
    ),
    group_size AS (
      SELECT
        latest.connector_group_id,
        SUM(cs.connector_count) AS connector_count
      FROM (
        SELECT
          cs.connector_group_id,
          MAX(LEAST(COALESCE(cs.ended_at, ${window.to}::timestamptz), ${window.to}::timestamptz))
            AS observed_to
        FROM connector_states cs
        JOIN connector_groups g ON g.id = cs.connector_group_id
        JOIN stations st ON st.id = g.station_id
        WHERE st.slug = ${slug} AND ${overlapsWindow("cs", window)}
        GROUP BY 1
      ) latest
      JOIN connector_states cs ON cs.connector_group_id = latest.connector_group_id
      WHERE cs.started_at < latest.observed_to
        AND COALESCE(cs.ended_at, ${window.to}::timestamptz) >= latest.observed_to
      GROUP BY 1
    ),
    observed AS (
      SELECT
        connector_group_id,
        EXTRACT(HOUR FROM local_hour)::int AS hour,
        SUM(EXTRACT(EPOCH FROM (upper(covered) - lower(covered)))) AS observed_secs
      FROM (
        SELECT
          connector_group_id,
          local_hour,
          unnest(range_agg(tstzrange(slot_from, slot_to))) AS covered
        FROM sliced
        WHERE slot_to > slot_from
        GROUP BY connector_group_id, local_hour
      ) merged
      GROUP BY 1, 2
    )
    SELECT
      g.id AS connector_group_id,
      g.connector_type,
      g.power_kw,
      g.has_cable,
      group_size.connector_count,
      cs.hour,
      COALESCE(SUM(cs.connector_count * ${SLOT_SECONDS}) FILTER (WHERE ${IN_USE}), 0)
        AS in_use_secs,
      COALESCE(SUM(cs.connector_count * ${SLOT_SECONDS}) FILTER (WHERE ${FREE_DETAIL}), 0)
        AS free_secs,
      COALESCE(SUM(cs.connector_count * ${SLOT_SECONDS}) FILTER (WHERE cs.health = 'faulted'), 0)
        AS broken_secs,
      observed.observed_secs
    FROM sliced cs
    JOIN connector_groups g ON g.id = cs.connector_group_id
    JOIN observed
      ON observed.connector_group_id = cs.connector_group_id AND observed.hour = cs.hour
    LEFT JOIN group_size ON group_size.connector_group_id = cs.connector_group_id
    WHERE cs.slot_to > cs.slot_from
    GROUP BY
      g.id, g.connector_type, g.power_kw, g.has_cable,
      group_size.connector_count, cs.hour, observed.observed_secs
    ORDER BY g.connector_type, g.power_kw, g.id, cs.hour
  `);

  const groups = new Map<number, ConnectorGroupHourlyUsage>();

  for (const row of rows) {
    const groupId = toNumber(row.connector_group_id);
    let group = groups.get(groupId);
    if (!group) {
      group = {
        connectorGroupId: groupId,
        connectorType: row.connector_type,
        powerKw: toNumber(row.power_kw),
        hasCable: row.has_cable,
        connectorCount: toNullableNumber(row.connector_count),
        hours: [],
      };
      groups.set(groupId, group);
    }

    const inUse = toNumber(row.in_use_secs);
    const free = toNumber(row.free_secs);
    const broken = toNumber(row.broken_secs);
    const usable = free + inUse;

    group.hours.push({
      hour: toNumber(row.hour),
      utilization: usable > 0 ? round(inUse / usable, 4) : 0,
      brokenShare: usable + broken > 0 ? round(broken / (usable + broken), 4) : 0,
      observedHours: round(toNumber(row.observed_secs) / 3600, 4),
    });
  }

  return [...groups.values()];
}
