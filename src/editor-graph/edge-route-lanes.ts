import type { XYPosition } from '@xyflow/react';
import type { EdgeRouteCenter } from '@/editor-graph/edge-routing';

export const PARALLEL_EDGE_GAP = 4;
export const SEGMENT_KEY_EPS = 2;
const MIN_CORRIDOR_SEGMENT_LEN = 40;

export type CorridorSegmentKind = 'h' | 'v';

export interface CorridorSegmentKey {
  kind: CorridorSegmentKind;
  /** Rounded coordinate of the corridor line (y for horizontal, x for vertical). */
  coord: number;
  spanMin: number;
  spanMax: number;
}

export interface EdgeRouteDraft {
  edgeId: string;
  needsRouting: boolean;
  center: EdgeRouteCenter;
  waypoints: XYPosition[];
}

function roundCoord(value: number): number {
  return Math.round(value / SEGMENT_KEY_EPS) * SEGMENT_KEY_EPS;
}

function segmentKeyString(key: CorridorSegmentKey): string {
  return `${key.kind}:${key.coord}:${roundCoord(key.spanMin)}:${roundCoord(key.spanMax)}`;
}

function isAxisAligned(a: XYPosition, b: XYPosition): 'h' | 'v' | null {
  if (Math.abs(a.y - b.y) < 0.5 && Math.abs(a.x - b.x) >= MIN_CORRIDOR_SEGMENT_LEN) return 'h';
  if (Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) >= MIN_CORRIDOR_SEGMENT_LEN) return 'v';
  return null;
}

/** Long axis-aligned corridor segments from a routed polyline. */
export function extractCorridorSegments(waypoints: XYPosition[]): CorridorSegmentKey[] {
  const keys: CorridorSegmentKey[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < waypoints.length - 1; i++) {
    const a = waypoints[i]!;
    const b = waypoints[i + 1]!;
    const kind = isAxisAligned(a, b);
    if (!kind) continue;

    const key: CorridorSegmentKey =
      kind === 'h'
        ? {
            kind: 'h',
            coord: roundCoord(a.y),
            spanMin: Math.min(a.x, b.x),
            spanMax: Math.max(a.x, b.x),
          }
        : {
            kind: 'v',
            coord: roundCoord(a.x),
            spanMin: Math.min(a.y, b.y),
            spanMax: Math.max(a.y, b.y),
          };

    const id = segmentKeyString(key);
    if (seen.has(id)) continue;
    seen.add(id);
    keys.push(key);
  }

  return keys;
}

function laneOffsetForIndex(index: number, count: number): number {
  return (index - (count - 1) / 2) * PARALLEL_EDGE_GAP;
}

function corridorGroupKey(segment: CorridorSegmentKey): string {
  return `${segment.kind}:${segment.coord}`;
}

/**
 * Absolute lane centers per edge: spreads edges that share the same corridor segment.
 * Handles are not moved — only centerX/centerY for smooth-step routing.
 */
export function computeParallelLaneCenters(
  drafts: EdgeRouteDraft[],
): Map<string, EdgeRouteCenter> {
  const groups = new Map<string, string[]>();

  for (const draft of drafts) {
    if (!draft.needsRouting) continue;
    for (const segment of extractCorridorSegments(draft.waypoints)) {
      const id = corridorGroupKey(segment);
      const list = groups.get(id) ?? [];
      if (!list.includes(draft.edgeId)) list.push(draft.edgeId);
      groups.set(id, list);
    }
  }

  const result = new Map<string, EdgeRouteCenter>();

  for (const draft of drafts) {
    if (draft.needsRouting) {
      result.set(draft.edgeId, { ...draft.center });
    }
  }

  for (const [keyId, edgeIds] of groups) {
    if (edgeIds.length < 2) continue;
    const [kind, coordStr] = keyId.split(':') as [CorridorSegmentKind, string];
    const coord = Number(coordStr);
    const sorted = [...edgeIds].sort();

    sorted.forEach((edgeId, index) => {
      const offset = laneOffsetForIndex(index, sorted.length);
      const prev = result.get(edgeId) ?? {};
      if (kind === 'h') {
        result.set(edgeId, { ...prev, centerY: coord + offset });
      } else {
        result.set(edgeId, { ...prev, centerX: coord + offset });
      }
    });
  }

  return result;
}

/** Min distance between parallel corridor lines of two routed edges (for tests). */
export function minCorridorSeparation(
  waypointsA: XYPosition[],
  waypointsB: XYPosition[],
): number {
  const segsA = extractCorridorSegments(waypointsA);
  const segsB = extractCorridorSegments(waypointsB);
  let min = Number.POSITIVE_INFINITY;

  for (const a of segsA) {
    for (const b of segsB) {
      if (a.kind !== b.kind) continue;
      const overlapMin = Math.max(a.spanMin, b.spanMin);
      const overlapMax = Math.min(a.spanMax, b.spanMax);
      if (overlapMax - overlapMin < MIN_CORRIDOR_SEGMENT_LEN / 2) continue;
      const dist = Math.abs(a.coord - b.coord);
      if (dist < min) min = dist;
    }
  }

  return min;
}
