import type { StationTimelineEntry } from "@/lib/metrics/queries";
import { connectorUsageState, type ConnectorUsage } from "./health";

export interface UsageBand {
  state: ConnectorUsage;
  connectors: number;
  sharePct: number;
}

export interface TimelineSlice {
  leftPct: number;
  widthPct: number;
  from: number;
  to: number;
  connectors: number;
  bands: UsageBand[];
}

export interface ConnectorGroupTimeline {
  key: string;
  connectorType: string;
  powerKw: number;
  hasCable: boolean;
  connectors: number;
  slices: TimelineSlice[];
  seconds: Record<ConnectorUsage, number>;
}

interface ClippedEntry {
  from: number;
  to: number;
  state: ConnectorUsage;
  connectors: number;
}

const EMPTY_SECONDS: Record<ConnectorUsage, number> = {
  free: 0,
  inUse: 0,
  broken: 0,
  absent: 0,
  unknown: 0,
};

export function buildConnectorTimelines(
  timeline: StationTimelineEntry[],
  rangeStart: number,
  rangeEnd: number,
): ConnectorGroupTimeline[] {
  const span = Math.max(rangeEnd - rangeStart, 1);
  const entriesByGroup = new Map<string, { entry: StationTimelineEntry; clipped: ClippedEntry }[]>();

  for (const entry of timeline) {
    const clipped = clip(entry, rangeStart, rangeEnd);
    if (!clipped) continue;
    const key = groupKey(entry);
    const existing = entriesByGroup.get(key);
    if (existing) existing.push({ entry, clipped });
    else entriesByGroup.set(key, [{ entry, clipped }]);
  }

  const timelines: ConnectorGroupTimeline[] = [];

  for (const [key, members] of entriesByGroup) {
    const clipped = members.map((member) => member.clipped);
    const slices = sliceByOverlap(clipped, rangeStart, span);
    const head = members[0].entry;

    timelines.push({
      key,
      connectorType: head.connectorType,
      powerKw: head.powerKw,
      hasCable: head.hasCable,
      connectors: slices.length > 0 ? slices[slices.length - 1].connectors : 0,
      slices,
      seconds: totalSecondsByState(clipped),
    });
  }

  return timelines.sort(
    (a, b) => a.connectorType.localeCompare(b.connectorType) || b.powerKw - a.powerKw,
  );
}

function groupKey(entry: StationTimelineEntry): string {
  return `${entry.connectorType}|${entry.powerKw}|${entry.hasCable}`;
}

function clip(
  entry: StationTimelineEntry,
  rangeStart: number,
  rangeEnd: number,
): ClippedEntry | null {
  const startedAt = new Date(entry.startedAt).getTime();
  const endedAt = entry.endedAt ? new Date(entry.endedAt).getTime() : rangeEnd;
  if (Number.isNaN(startedAt) || Number.isNaN(endedAt)) return null;

  const from = Math.max(startedAt, rangeStart);
  const to = Math.min(endedAt, rangeEnd);
  if (to <= from) return null;

  return {
    from,
    to,
    state: connectorUsageState(entry.health, entry.statusDetail),
    connectors: entry.connectorCount,
  };
}

function sliceByOverlap(
  entries: ClippedEntry[],
  rangeStart: number,
  span: number,
): TimelineSlice[] {
  const boundaries = [...new Set(entries.flatMap((entry) => [entry.from, entry.to]))].sort(
    (a, b) => a - b,
  );

  const slices: TimelineSlice[] = [];

  for (let index = 0; index < boundaries.length - 1; index += 1) {
    const from = boundaries[index];
    const to = boundaries[index + 1];
    const active = entries.filter((entry) => entry.from < to && entry.to > from);
    if (active.length === 0) continue;

    const connectors = active.reduce((total, entry) => total + entry.connectors, 0);
    if (connectors === 0) continue;

    slices.push({
      leftPct: ((from - rangeStart) / span) * 100,
      widthPct: ((to - from) / span) * 100,
      from,
      to,
      connectors,
      bands: bandsFor(active, connectors),
    });
  }

  return slices;
}

const BAND_ORDER: ConnectorUsage[] = ["broken", "absent", "unknown", "inUse", "free"];

function bandsFor(active: ClippedEntry[], connectors: number): UsageBand[] {
  const byState = new Map<ConnectorUsage, number>();
  for (const entry of active) {
    byState.set(entry.state, (byState.get(entry.state) ?? 0) + entry.connectors);
  }

  return BAND_ORDER.filter((state) => (byState.get(state) ?? 0) > 0).map((state) => {
    const count = byState.get(state) ?? 0;
    return { state, connectors: count, sharePct: (count / connectors) * 100 };
  });
}

function totalSecondsByState(entries: ClippedEntry[]): Record<ConnectorUsage, number> {
  const seconds = { ...EMPTY_SECONDS };
  for (const entry of entries) {
    seconds[entry.state] += ((entry.to - entry.from) / 1000) * entry.connectors;
  }
  return seconds;
}

export interface TimelineRange {
  start: number;
  end: number;
  clampedByRowLimit: boolean;
}

export function resolveTimelineRange(
  timeline: StationTimelineEntry[],
  timelineTruncated: boolean,
  firstSeenAt: string,
  windowStart: string,
  windowEnd: string,
): TimelineRange | null {
  const end = new Date(windowEnd).getTime();
  const windowFrom = new Date(windowStart).getTime();
  if (!Number.isFinite(end) || !Number.isFinite(windowFrom)) return null;

  const firstSeen = new Date(firstSeenAt).getTime();
  const observedStart = Number.isFinite(firstSeen) ? Math.max(windowFrom, firstSeen) : windowFrom;

  const retainedStart = timelineTruncated ? oldestRetainedStart(timeline) : null;
  if (retainedStart === null || retainedStart <= observedStart) {
    return { start: observedStart, end, clampedByRowLimit: false };
  }

  return { start: retainedStart, end, clampedByRowLimit: true };
}

function oldestRetainedStart(timeline: StationTimelineEntry[]): number | null {
  let oldest = Number.POSITIVE_INFINITY;

  for (const entry of timeline) {
    const startedAt = new Date(entry.startedAt).getTime();
    if (Number.isFinite(startedAt) && startedAt < oldest) oldest = startedAt;
  }

  return Number.isFinite(oldest) ? oldest : null;
}
