import { desc, eq, inArray, isNull } from "drizzle-orm";
import type { WriteDatabase } from "../db/client";
import { connectorGroups, connectorStates, pollRuns, stationStates, stations } from "../db/schema";
import { fetchStationFeed, type FeedResult } from "../ute/client";
import {
  UNKNOWN_DEPARTMENT,
  coordinateKey,
  fold,
  normalizeDepartment,
  normalizeText,
  slugify,
} from "../ute/normalize";
import {
  ABSENT_STATUS,
  classifyConnectorHealth,
  STATION_PRESENCE,
  UNKNOWN_STATUS,
  type StationPresence,
} from "../ute/status";
import type { StationPayload } from "../ute/types";

type Transaction = Parameters<Parameters<WriteDatabase["transaction"]>[0]>[0];

type StationRow = typeof stations.$inferSelect;
type ConnectorGroupRow = typeof connectorGroups.$inferSelect;
type StationStateRow = typeof stationStates.$inferSelect;
type ConnectorStateRow = typeof connectorStates.$inferSelect;
type StationChanges = Partial<typeof stations.$inferInsert>;

export const IMPLAUSIBLE_PAYLOAD = "implausible_payload";

const MIN_PLAUSIBLE_STATION_RATIO = 0.5;

export type IngestOutcome = FeedResult["outcome"] | typeof IMPLAUSIBLE_PAYLOAD;

export interface IngestResult {
  pollRunId: number;
  outcome: IngestOutcome;
  observedAt: Date;
  durationMs: number;
  payloadUnchanged: boolean;
  stationsInFeed: number;
  connectorsInFeed: number;
  duplicateStations: number;
  rejectedStations: number;
  stationsCreated: number;
  connectorGroupsCreated: number;
  stationStateChanges: number;
  connectorStateChanges: number;
  errorMessage: string | null;
}

export interface IngestOptions {
  observedAt?: Date;
  feed?: FeedResult;
}

const NO_CHANGES = {
  payloadUnchanged: false,
  stationsInFeed: 0,
  connectorsInFeed: 0,
  duplicateStations: 0,
  stationsCreated: 0,
  connectorGroupsCreated: 0,
  stationStateChanges: 0,
  connectorStateChanges: 0,
} as const;

export async function runIngestion(
  db: WriteDatabase,
  options: IngestOptions = {},
): Promise<IngestResult> {
  const feed = options.feed ?? (await fetchStationFeed());
  const observedAt = options.observedAt ?? new Date();

  if (feed.outcome !== "success") {
    return recordUnusableFeed(db, feed, observedAt);
  }

  return db.transaction((tx) => applyFeed(tx, feed, observedAt));
}

async function recordUnusableFeed(
  db: WriteDatabase,
  feed: FeedResult,
  observedAt: Date,
): Promise<IngestResult> {
  const [run] = await db
    .insert(pollRuns)
    .values({
      startedAt: observedAt,
      durationMs: feed.durationMs,
      outcome: feed.outcome,
      httpStatus: feed.httpStatus,
      stationCount: null,
      connectorCount: null,
      payloadDigest: feed.payloadDigest,
      errorMessage: feed.errorMessage,
    })
    .returning({ id: pollRuns.id });

  return {
    ...NO_CHANGES,
    pollRunId: run.id,
    outcome: feed.outcome,
    observedAt,
    durationMs: feed.durationMs,
    rejectedStations: feed.rejectedStations,
    errorMessage: feed.errorMessage,
  };
}

async function applyFeed(
  tx: Transaction,
  feed: FeedResult,
  observedAt: Date,
): Promise<IngestResult> {
  const incoming = readIncomingStations(feed.stations);
  const previousDigest = await lastSuccessfulDigest(tx);
  const stored = await loadStoredState(tx);

  if (collapsedAgainst(stored.stations.length, incoming.entries.length)) {
    return rejectImplausibleFeed(tx, feed, observedAt, incoming, stored.stations.length);
  }

  const reconciledStations = await reconcileStations(tx, incoming.entries, stored, observedAt);
  const reconciledConnectors = await reconcileConnectorGroups(
    tx,
    reconciledStations.matched,
    stored,
    observedAt,
  );

  const connectorPlan = planConnectorStates(
    reconciledConnectors.desiredByGroupId,
    stored.openConnectorStates,
    observedAt,
  );
  const presencePlan = planStationPresence(reconciledStations.matched, stored, observedAt);

  await closeIntervals(tx, connectorPlan.closures, presencePlan.closures, observedAt);
  await openIntervals(tx, connectorPlan.openings, presencePlan.openings);

  const [run] = await tx
    .insert(pollRuns)
    .values({
      startedAt: observedAt,
      durationMs: feed.durationMs,
      outcome: feed.outcome,
      httpStatus: feed.httpStatus,
      stationCount: incoming.entries.length,
      connectorCount: incoming.connectorCount,
      payloadDigest: feed.payloadDigest,
      errorMessage: feed.errorMessage,
    })
    .returning({ id: pollRuns.id });

  return {
    pollRunId: run.id,
    outcome: feed.outcome,
    observedAt,
    durationMs: feed.durationMs,
    payloadUnchanged: previousDigest !== null && previousDigest === feed.payloadDigest,
    stationsInFeed: incoming.entries.length,
    connectorsInFeed: incoming.connectorCount,
    duplicateStations: incoming.duplicates,
    rejectedStations: feed.rejectedStations,
    stationsCreated: reconciledStations.created,
    connectorGroupsCreated: reconciledConnectors.created,
    stationStateChanges: presencePlan.openings.length,
    connectorStateChanges: connectorPlan.openings.length,
    errorMessage: feed.errorMessage,
  };
}

function collapsedAgainst(storedCount: number, incomingCount: number): boolean {
  if (storedCount === 0) return false;
  return incomingCount < storedCount * MIN_PLAUSIBLE_STATION_RATIO;
}

async function rejectImplausibleFeed(
  tx: Transaction,
  feed: FeedResult,
  observedAt: Date,
  incoming: IncomingFeed,
  storedCount: number,
): Promise<IngestResult> {
  const errorMessage =
    `Feed reported ${incoming.entries.length} stations against ${storedCount} on record; ` +
    "state left untouched";

  const [run] = await tx
    .insert(pollRuns)
    .values({
      startedAt: observedAt,
      durationMs: feed.durationMs,
      outcome: IMPLAUSIBLE_PAYLOAD,
      httpStatus: feed.httpStatus,
      stationCount: incoming.entries.length,
      connectorCount: incoming.connectorCount,
      payloadDigest: feed.payloadDigest,
      errorMessage,
    })
    .returning({ id: pollRuns.id });

  return {
    ...NO_CHANGES,
    pollRunId: run.id,
    outcome: IMPLAUSIBLE_PAYLOAD,
    observedAt,
    durationMs: feed.durationMs,
    stationsInFeed: incoming.entries.length,
    connectorsInFeed: incoming.connectorCount,
    duplicateStations: incoming.duplicates,
    rejectedStations: feed.rejectedStations,
    errorMessage,
  };
}

async function lastSuccessfulDigest(tx: Transaction): Promise<string | null> {
  const [row] = await tx
    .select({ payloadDigest: pollRuns.payloadDigest })
    .from(pollRuns)
    .where(eq(pollRuns.outcome, "success"))
    .orderBy(desc(pollRuns.startedAt))
    .limit(1);

  return row?.payloadDigest ?? null;
}

interface StoredState {
  stations: StationRow[];
  connectorGroups: ConnectorGroupRow[];
  openStationStates: StationStateRow[];
  openConnectorStates: ConnectorStateRow[];
}

async function loadStoredState(tx: Transaction): Promise<StoredState> {
  return {
    stations: await tx.select().from(stations),
    connectorGroups: await tx.select().from(connectorGroups),
    openStationStates: await tx.select().from(stationStates).where(isNull(stationStates.endedAt)),
    openConnectorStates: await tx
      .select()
      .from(connectorStates)
      .where(isNull(connectorStates.endedAt)),
  };
}

interface ReconciledStations {
  matched: Map<number, IncomingStation>;
  created: number;
}

async function reconcileStations(
  tx: Transaction,
  entries: IncomingStation[],
  stored: StoredState,
  observedAt: Date,
): Promise<ReconciledStations> {
  const storedById = new Map(stored.stations.map((row) => [row.id, row]));
  const idByCoordKey = new Map(stored.stations.map((row) => [row.coordKey, row.id]));
  const idByNameKey = indexUniqueIds(stored.stations, (row) => row.nameKey);
  const takenSlugs = new Set(stored.stations.map((row) => row.slug));

  const matched = new Map<number, IncomingStation>();
  const unmatched: IncomingStation[] = [];

  for (const entry of entries) {
    const id = findUnclaimedStationId(entry, idByCoordKey, idByNameKey, matched);
    if (id === undefined) {
      unmatched.push(entry);
      continue;
    }
    matched.set(id, entry);
  }

  const updatesByChanges = new Map<string, { changes: StationChanges; ids: number[] }>();

  for (const [stationId, entry] of matched) {
    const current = storedById.get(stationId);
    if (!current) continue;

    const claimedCoordKey = claimCoordinateKey(idByCoordKey, current, entry, stationId);
    const changes = changedStationFields(current, entry, claimedCoordKey);
    if (!changes) continue;

    const signature = JSON.stringify(changes);
    const pending = updatesByChanges.get(signature);
    if (pending) pending.ids.push(stationId);
    else updatesByChanges.set(signature, { changes, ids: [stationId] });
  }

  for (const { changes, ids } of updatesByChanges.values()) {
    await tx.update(stations).set(changes).where(inArray(stations.id, ids));
  }

  const created = await insertStations(tx, unmatched, matched, idByCoordKey, takenSlugs, observedAt);

  const seenIds = [...matched.keys()];
  if (seenIds.length > 0) {
    await tx.update(stations).set({ lastSeenAt: observedAt }).where(inArray(stations.id, seenIds));
  }

  return { matched, created };
}

function findUnclaimedStationId(
  entry: IncomingStation,
  idByCoordKey: Map<string, number>,
  idByNameKey: Map<string, number>,
  claimed: Map<number, IncomingStation>,
): number | undefined {
  const candidates = [idByCoordKey.get(entry.coordKey), idByNameKey.get(entry.nameKey)];
  return candidates.find((id) => id !== undefined && !claimed.has(id));
}

function claimCoordinateKey(
  idByCoordKey: Map<string, number>,
  current: StationRow,
  entry: IncomingStation,
  stationId: number,
): string | null {
  if (current.coordKey === entry.coordKey) return null;

  const owner = idByCoordKey.get(entry.coordKey);
  if (owner !== undefined && owner !== stationId) return null;

  idByCoordKey.delete(current.coordKey);
  idByCoordKey.set(entry.coordKey, stationId);
  return entry.coordKey;
}

function changedStationFields(
  current: StationRow,
  entry: IncomingStation,
  claimedCoordKey: string | null,
): StationChanges | null {
  const changes: StationChanges = {};

  if (current.name !== entry.name) changes.name = entry.name;
  if (current.nameKey !== entry.nameKey) changes.nameKey = entry.nameKey;
  if (current.address !== entry.address && entry.address !== null) changes.address = entry.address;
  if (current.city !== entry.city && entry.city !== null) changes.city = entry.city;
  if (entry.department !== UNKNOWN_DEPARTMENT && current.department !== entry.department) {
    changes.department = entry.department;
  }
  if (current.departmentRaw !== entry.departmentRaw && entry.departmentRaw !== null) {
    changes.departmentRaw = entry.departmentRaw;
  }
  if (current.source !== entry.source && entry.source !== null) changes.source = entry.source;
  if (current.latitude !== entry.latitude) changes.latitude = entry.latitude;
  if (current.longitude !== entry.longitude) changes.longitude = entry.longitude;
  if (claimedCoordKey !== null) changes.coordKey = claimedCoordKey;

  return Object.keys(changes).length > 0 ? changes : null;
}

async function insertStations(
  tx: Transaction,
  entries: IncomingStation[],
  matched: Map<number, IncomingStation>,
  idByCoordKey: Map<string, number>,
  takenSlugs: Set<string>,
  observedAt: Date,
): Promise<number> {
  if (entries.length === 0) return 0;

  const rows = entries.map((entry) => ({
    slug: claimSlug(slugify(entry.name), takenSlugs),
    coordKey: entry.coordKey,
    nameKey: entry.nameKey,
    name: entry.name,
    address: entry.address,
    city: entry.city,
    department: entry.department,
    departmentRaw: entry.departmentRaw,
    latitude: entry.latitude,
    longitude: entry.longitude,
    source: entry.source,
    firstSeenAt: observedAt,
    lastSeenAt: observedAt,
  }));

  const inserted = await tx
    .insert(stations)
    .values(rows)
    .returning({ id: stations.id, coordKey: stations.coordKey });

  const entryByCoordKey = new Map(entries.map((entry) => [entry.coordKey, entry]));
  for (const row of inserted) {
    const entry = entryByCoordKey.get(row.coordKey);
    if (!entry) continue;
    matched.set(row.id, entry);
    idByCoordKey.set(row.coordKey, row.id);
  }

  return inserted.length;
}

interface ReconciledConnectors {
  desiredByGroupId: Map<number, Map<string, DesiredConnectorState>>;
  created: number;
}

async function reconcileConnectorGroups(
  tx: Transaction,
  matched: Map<number, IncomingStation>,
  stored: StoredState,
  observedAt: Date,
): Promise<ReconciledConnectors> {
  const groupIdByIdentity = new Map(
    stored.connectorGroups.map((row) => [
      groupIdentity(row.stationId, row.connectorType, row.powerKw, row.hasCable),
      row.id,
    ]),
  );

  const desiredByIdentity = new Map<string, Map<string, DesiredConnectorState>>();
  const groupsToCreate = new Map<string, typeof connectorGroups.$inferInsert>();

  for (const [stationId, entry] of matched) {
    for (const group of entry.groups) {
      const identity = groupIdentity(stationId, group.type, group.power, group.hasCable);
      accumulateDesiredState(desiredByIdentity, identity, group);

      if (!groupIdByIdentity.has(identity) && !groupsToCreate.has(identity)) {
        groupsToCreate.set(identity, {
          stationId,
          connectorType: group.type,
          powerKw: group.power,
          hasCable: group.hasCable,
          firstSeenAt: observedAt,
          lastSeenAt: observedAt,
        });
      }
    }
  }

  if (groupsToCreate.size > 0) {
    const inserted = await tx
      .insert(connectorGroups)
      .values([...groupsToCreate.values()])
      .returning();

    for (const row of inserted) {
      groupIdByIdentity.set(
        groupIdentity(row.stationId, row.connectorType, row.powerKw, row.hasCable),
        row.id,
      );
    }
  }

  const desiredByGroupId = new Map<number, Map<string, DesiredConnectorState>>();
  const seenGroupIds: number[] = [];

  for (const [identity, states] of desiredByIdentity) {
    const groupId = groupIdByIdentity.get(identity);
    if (groupId === undefined) continue;
    seenGroupIds.push(groupId);
    desiredByGroupId.set(groupId, states);
  }

  if (seenGroupIds.length > 0) {
    await tx
      .update(connectorGroups)
      .set({ lastSeenAt: observedAt })
      .where(inArray(connectorGroups.id, seenGroupIds));
  }

  markUnreportedGroupsAbsent(desiredByGroupId, stored);

  return { desiredByGroupId, created: groupsToCreate.size };
}

function accumulateDesiredState(
  desiredByIdentity: Map<string, Map<string, DesiredConnectorState>>,
  identity: string,
  group: IncomingConnectorGroup,
): void {
  let states = desiredByIdentity.get(identity);
  if (!states) {
    states = new Map<string, DesiredConnectorState>();
    desiredByIdentity.set(identity, states);
  }

  const key = stateKey(group.statusDetail, group.statusCode);
  const existing = states.get(key);
  if (existing) {
    existing.connectorCount += group.count;
    return;
  }

  states.set(key, {
    statusCode: group.statusCode,
    statusDetail: group.statusDetail,
    connectorCount: group.count,
  });
}

function markUnreportedGroupsAbsent(
  desiredByGroupId: Map<number, Map<string, DesiredConnectorState>>,
  stored: StoredState,
): void {
  const openByGroupId = groupStatesByConnectorGroup(stored.openConnectorStates);

  for (const row of stored.connectorGroups) {
    if (desiredByGroupId.has(row.id)) continue;

    const vanishedCount = (openByGroupId.get(row.id) ?? []).reduce(
      (total, state) => total + state.connectorCount,
      0,
    );

    desiredByGroupId.set(
      row.id,
      new Map([
        [
          stateKey(ABSENT_STATUS, null),
          { statusCode: null, statusDetail: ABSENT_STATUS, connectorCount: vanishedCount },
        ],
      ]),
    );
  }
}

function groupStatesByConnectorGroup(rows: ConnectorStateRow[]): Map<number, ConnectorStateRow[]> {
  const byGroupId = new Map<number, ConnectorStateRow[]>();
  for (const row of rows) {
    const existing = byGroupId.get(row.connectorGroupId);
    if (existing) existing.push(row);
    else byGroupId.set(row.connectorGroupId, [row]);
  }
  return byGroupId;
}

interface IntervalPlan<TInsert> {
  closures: number[];
  openings: TInsert[];
}

function planConnectorStates(
  desiredByGroupId: Map<number, Map<string, DesiredConnectorState>>,
  openConnectorStates: ConnectorStateRow[],
  observedAt: Date,
): IntervalPlan<typeof connectorStates.$inferInsert> {
  const openByGroupId = groupStatesByConnectorGroup(openConnectorStates);
  const closures: number[] = [];
  const openings: Array<typeof connectorStates.$inferInsert> = [];

  for (const [groupId, desiredStates] of desiredByGroupId) {
    const openStates = new Map(
      (openByGroupId.get(groupId) ?? []).map((row) => [
        stateKey(row.statusDetail, row.statusCode),
        row,
      ]),
    );

    for (const [key, desired] of desiredStates) {
      const open = openStates.get(key);
      if (open && open.connectorCount === desired.connectorCount) continue;
      if (open) closures.push(open.id);

      openings.push({
        connectorGroupId: groupId,
        statusCode: desired.statusCode,
        statusDetail: desired.statusDetail,
        health: classifyConnectorHealth(desired.statusDetail),
        connectorCount: desired.connectorCount,
        startedAt: observedAt,
        endedAt: null,
      });
    }

    for (const [key, open] of openStates) {
      if (!desiredStates.has(key)) closures.push(open.id);
    }
  }

  return { closures, openings };
}

function planStationPresence(
  matched: Map<number, IncomingStation>,
  stored: StoredState,
  observedAt: Date,
): IntervalPlan<typeof stationStates.$inferInsert> {
  const desiredPresence = new Map<number, StationPresence>();
  for (const [stationId, entry] of matched) {
    desiredPresence.set(stationId, entry.presence);
  }
  for (const row of stored.stations) {
    if (!desiredPresence.has(row.id)) {
      desiredPresence.set(row.id, STATION_PRESENCE.delisted);
    }
  }

  const openByStationId = new Map(stored.openStationStates.map((row) => [row.stationId, row]));
  const closures: number[] = [];
  const openings: Array<typeof stationStates.$inferInsert> = [];

  for (const [stationId, presence] of desiredPresence) {
    const open = openByStationId.get(stationId);
    if (open && open.state === presence) continue;
    if (open) closures.push(open.id);
    openings.push({ stationId, state: presence, startedAt: observedAt, endedAt: null });
  }

  return { closures, openings };
}

async function closeIntervals(
  tx: Transaction,
  connectorStateIds: number[],
  stationStateIds: number[],
  observedAt: Date,
): Promise<void> {
  if (connectorStateIds.length > 0) {
    await tx
      .update(connectorStates)
      .set({ endedAt: observedAt })
      .where(inArray(connectorStates.id, connectorStateIds));
  }
  if (stationStateIds.length > 0) {
    await tx
      .update(stationStates)
      .set({ endedAt: observedAt })
      .where(inArray(stationStates.id, stationStateIds));
  }
}

async function openIntervals(
  tx: Transaction,
  connectorRows: Array<typeof connectorStates.$inferInsert>,
  stationRows: Array<typeof stationStates.$inferInsert>,
): Promise<void> {
  if (connectorRows.length > 0) await tx.insert(connectorStates).values(connectorRows);
  if (stationRows.length > 0) await tx.insert(stationStates).values(stationRows);
}

interface IncomingConnectorGroup {
  type: string;
  power: number;
  hasCable: boolean;
  count: number;
  statusCode: number | null;
  statusDetail: string;
}

interface IncomingStation {
  coordKey: string;
  nameKey: string;
  name: string;
  address: string | null;
  city: string | null;
  department: string;
  departmentRaw: string | null;
  latitude: number;
  longitude: number;
  source: string | null;
  presence: StationPresence;
  groups: IncomingConnectorGroup[];
}

interface DesiredConnectorState {
  statusCode: number | null;
  statusDetail: string;
  connectorCount: number;
}

interface IncomingFeed {
  entries: IncomingStation[];
  duplicates: number;
  connectorCount: number;
}

function readIncomingStations(payload: StationPayload[]): IncomingFeed {
  const entries: IncomingStation[] = [];
  const seenCoordKeys = new Set<string>();
  let duplicates = 0;
  let connectorCount = 0;

  for (const station of payload) {
    const name = normalizeText(station.name) ?? station.name;
    const coordKey = coordinateKey(station.lat, station.lng);
    if (seenCoordKeys.has(coordKey)) {
      duplicates += 1;
      continue;
    }
    seenCoordKeys.add(coordKey);

    const groups = (station.connectorStatusAcc ?? []).map((group) => ({
      type: normalizeText(group.type) ?? group.type,
      power: group.power,
      hasCable: group.hose ?? false,
      count: group.count,
      statusCode: group.status ?? null,
      statusDetail: normalizeText(group.statusDetail) ?? UNKNOWN_STATUS,
    }));

    for (const group of groups) connectorCount += group.count;

    entries.push({
      coordKey,
      nameKey: fold(name),
      name,
      address: normalizeText(station.address),
      city: normalizeText(station.city),
      department: normalizeDepartment(station.department),
      departmentRaw: normalizeText(station.department),
      latitude: station.lat,
      longitude: station.lng,
      source: normalizeText(station.source),
      presence: groups.length > 0 ? STATION_PRESENCE.listed : STATION_PRESENCE.silent,
      groups,
    });
  }

  return { entries, duplicates, connectorCount };
}

function groupIdentity(stationId: number, type: string, power: number, hasCable: boolean): string {
  return [stationId, fold(type), power.toFixed(2), hasCable ? 1 : 0].join("|");
}

function stateKey(statusDetail: string, statusCode: number | null): string {
  return `${fold(statusDetail)}|${statusCode ?? ""}`;
}

function indexUniqueIds<T extends { id: number }>(
  rows: T[],
  key: (row: T) => string,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const value = key(row);
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  const index = new Map<string, number>();
  for (const row of rows) {
    const value = key(row);
    if (counts.get(value) === 1) index.set(value, row.id);
  }
  return index;
}

function claimSlug(base: string, taken: Set<string>): string {
  if (!taken.has(base)) {
    taken.add(base);
    return base;
  }

  let suffix = 2;
  while (taken.has(`${base}-${suffix}`)) suffix += 1;

  const slug = `${base}-${suffix}`;
  taken.add(slug);
  return slug;
}
