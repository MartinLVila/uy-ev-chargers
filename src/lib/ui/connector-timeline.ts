import type { StationTimelineEntry } from "@/lib/metrics/queries";
import { connectorUsageState, type ConnectorUsage } from "./health";

export interface LaneSlice {
  leftPct: number;
  widthPct: number;
  from: number;
  to: number;
  state: ConnectorUsage;
}

export interface ConnectorLane {
  key: string;
  position: number;
  slices: LaneSlice[];
  seconds: Record<ConnectorUsage, number>;
}

export interface ConnectorGroupTimeline {
  key: string;
  connectorType: string;
  powerKw: number;
  hasCable: boolean;
  connectors: number;
  lanes: ConnectorLane[];
  seconds: Record<ConnectorUsage, number>;
}

interface ClippedEntry {
  from: number;
  to: number;
  state: ConnectorUsage;
  connectors: number;
}

interface Moment {
  from: number;
  to: number;
  counts: Map<ConnectorUsage, number>;
  connectors: number;
}

const EMPTY_SECONDS: Record<ConnectorUsage, number> = {
  free: 0,
  inUse: 0,
  broken: 0,
  absent: 0,
  unknown: 0,
};

const STATE_ORDER: ConnectorUsage[] = ["broken", "absent", "unknown", "inUse", "free"];

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
    const moments = momentsOfChange(clipped);
    if (moments.length === 0) continue;
    const head = members[0].entry;

    timelines.push({
      key,
      connectorType: head.connectorType,
      powerKw: head.powerKw,
      hasCable: head.hasCable,
      connectors: moments.length > 0 ? moments[moments.length - 1].connectors : 0,
      lanes: lanesOf(moments, key, rangeStart, span),
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

function momentsOfChange(entries: ClippedEntry[]): Moment[] {
  const boundaries = [...new Set(entries.flatMap((entry) => [entry.from, entry.to]))].sort(
    (a, b) => a - b,
  );

  const moments: Moment[] = [];

  for (let index = 0; index < boundaries.length - 1; index += 1) {
    const from = boundaries[index];
    const to = boundaries[index + 1];
    const active = entries.filter((entry) => entry.from < to && entry.to > from);
    if (active.length === 0) continue;

    const counts = new Map<ConnectorUsage, number>();
    for (const entry of active) {
      counts.set(entry.state, (counts.get(entry.state) ?? 0) + entry.connectors);
    }

    const connectors = active.reduce((total, entry) => total + entry.connectors, 0);
    if (connectors === 0) continue;

    moments.push({ from, to, counts, connectors });
  }

  return moments;
}

function lanesOf(
  moments: Moment[],
  groupKey: string,
  rangeStart: number,
  span: number,
): ConnectorLane[] {
  const width = moments.reduce((widest, moment) => Math.max(widest, moment.connectors), 0);
  const held: (ConnectorUsage | null)[] = Array.from({ length: width }, () => null);
  const runs: LaneSlice[][] = Array.from({ length: width }, () => []);

  for (const moment of moments) {
    const assigned = assignMoment(held, moment.counts);

    for (let lane = 0; lane < width; lane += 1) {
      held[lane] = assigned[lane];
      const state = assigned[lane];
      if (state === null) continue;
      extendRun(runs[lane], moment, state);
    }
  }

  return runs.map((slices, index) => ({
    key: `${groupKey}|${index}`,
    position: index + 1,
    slices: slices.map((slice) => ({
      ...slice,
      leftPct: ((slice.from - rangeStart) / span) * 100,
      widthPct: ((slice.to - slice.from) / span) * 100,
    })),
    seconds: secondsOfLane(slices),
  }));
}

function assignMoment(
  held: (ConnectorUsage | null)[],
  counts: Map<ConnectorUsage, number>,
): (ConnectorUsage | null)[] {
  const remaining = new Map(counts);
  const assigned: (ConnectorUsage | null)[] = held.map(() => null);

  held.forEach((state, lane) => {
    if (state === null) return;
    const left = remaining.get(state) ?? 0;
    if (left === 0) return;
    assigned[lane] = state;
    remaining.set(state, left - 1);
  });

  for (const state of STATE_ORDER) {
    let left = remaining.get(state) ?? 0;
    for (let lane = 0; lane < assigned.length && left > 0; lane += 1) {
      if (assigned[lane] !== null) continue;
      assigned[lane] = state;
      left -= 1;
    }
    remaining.set(state, left);
  }

  return assigned;
}

function extendRun(slices: LaneSlice[], moment: Moment, state: ConnectorUsage): void {
  const open = slices[slices.length - 1];

  if (open && open.state === state && open.to === moment.from) {
    open.to = moment.to;
    return;
  }

  slices.push({ leftPct: 0, widthPct: 0, from: moment.from, to: moment.to, state });
}

function secondsOfLane(slices: LaneSlice[]): Record<ConnectorUsage, number> {
  const seconds = { ...EMPTY_SECONDS };
  for (const slice of slices) seconds[slice.state] += (slice.to - slice.from) / 1000;
  return seconds;
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
  timelineCoversFrom: string | null,
  firstSeenAt: string,
  windowStart: string,
  windowEnd: string,
): TimelineRange | null {
  const end = new Date(windowEnd).getTime();
  const windowFrom = new Date(windowStart).getTime();
  if (!Number.isFinite(end) || !Number.isFinite(windowFrom)) return null;

  const firstSeen = new Date(firstSeenAt).getTime();
  const observedStart = Number.isFinite(firstSeen) ? Math.max(windowFrom, firstSeen) : windowFrom;

  const cutoff = timelineCoversFrom === null ? Number.NaN : new Date(timelineCoversFrom).getTime();
  if (!Number.isFinite(cutoff) || cutoff <= observedStart) {
    return { start: observedStart, end, clampedByRowLimit: false };
  }

  return { start: cutoff, end, clampedByRowLimit: true };
}
