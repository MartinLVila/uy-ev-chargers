import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  doublePrecision,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const ingestionLocks = pgTable("ingestion_locks", {
  name: text("name").primaryKey(),
  heldUntil: timestamp("held_until", { withTimezone: true }).notNull(),
});

export const stations = pgTable(
  "stations",
  {
    id: serial("id").primaryKey(),
    slug: text("slug").notNull(),
    coordKey: text("coord_key").notNull(),
    nameKey: text("name_key").notNull(),
    name: text("name").notNull(),
    address: text("address"),
    city: text("city"),
    department: text("department").notNull(),
    departmentRaw: text("department_raw"),
    latitude: doublePrecision("latitude").notNull(),
    longitude: doublePrecision("longitude").notNull(),
    source: text("source"),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("stations_slug_key").on(table.slug),
    uniqueIndex("stations_coord_key").on(table.coordKey),
    index("stations_name_key_idx").on(table.nameKey),
    index("stations_department_idx").on(table.department),
  ],
);

export const connectorGroups = pgTable(
  "connector_groups",
  {
    id: serial("id").primaryKey(),
    stationId: integer("station_id")
      .notNull()
      .references(() => stations.id, { onDelete: "cascade" }),
    connectorType: text("connector_type").notNull(),
    powerKw: doublePrecision("power_kw").notNull(),
    hasCable: boolean("has_cable").notNull(),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("connector_groups_identity_key").on(
      table.stationId,
      table.connectorType,
      table.powerKw,
      table.hasCable,
    ),
    index("connector_groups_station_idx").on(table.stationId),
  ],
);

export const pollRuns = pgTable(
  "poll_runs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    durationMs: integer("duration_ms").notNull(),
    outcome: text("outcome").notNull(),
    httpStatus: integer("http_status"),
    stationCount: integer("station_count"),
    connectorCount: integer("connector_count"),
    payloadDigest: text("payload_digest"),
    errorMessage: text("error_message"),
  },
  (table) => [
    index("poll_runs_started_at_idx").on(table.startedAt),
    index("poll_runs_digest_idx").on(table.payloadDigest),
  ],
);

export const connectorStates = pgTable(
  "connector_states",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    connectorGroupId: integer("connector_group_id")
      .notNull()
      .references(() => connectorGroups.id, { onDelete: "cascade" }),
    statusCode: integer("status_code"),
    statusDetail: text("status_detail").notNull(),
    health: text("health").notNull(),
    connectorCount: integer("connector_count").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
  },
  (table) => [
    index("connector_states_group_idx").on(table.connectorGroupId, table.startedAt),
    index("connector_states_open_idx").on(table.connectorGroupId).where(sql`ended_at IS NULL`),
    index("connector_states_window_idx").on(table.startedAt, table.endedAt),
    index("connector_states_health_idx").on(table.health),
  ],
);

export const stationStates = pgTable(
  "station_states",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    stationId: integer("station_id")
      .notNull()
      .references(() => stations.id, { onDelete: "cascade" }),
    state: text("state").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
  },
  (table) => [
    index("station_states_station_idx").on(table.stationId, table.startedAt),
    index("station_states_open_idx").on(table.stationId).where(sql`ended_at IS NULL`),
    index("station_states_window_idx").on(table.startedAt, table.endedAt),
  ],
);
