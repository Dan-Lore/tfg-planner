import { describe, expect, it } from 'vitest';
import type { XYPosition } from '@xyflow/react';
import {
  computeParallelLaneCenters,
  extractCorridorSegments,
  PARALLEL_EDGE_GAP,
  type EdgeRouteDraft,
} from '@/editor-graph/edge-route-lanes';

function hSegmentWaypoints(y: number, x0: number, x1: number): XYPosition[] {
  return [
    { x: x0, y: y - 20 },
    { x: x0, y },
    { x: x1, y },
    { x: x1, y: y + 20 },
  ];
}

describe('edge-route-lanes', () => {
  it('extracts long horizontal corridor segments', () => {
    const segs = extractCorridorSegments(hSegmentWaypoints(200, 100, 500));
    expect(segs).toHaveLength(1);
    expect(segs[0]).toMatchObject({ kind: 'h', coord: 200 });
  });

  it('spreads two edges sharing the same horizontal corridor by PARALLEL_EDGE_GAP', () => {
    const drafts: EdgeRouteDraft[] = [
      {
        edgeId: 'a',
        needsRouting: true,
        center: { centerY: 200 },
        waypoints: hSegmentWaypoints(200, 100, 500),
      },
      {
        edgeId: 'b',
        needsRouting: true,
        center: { centerY: 200 },
        waypoints: hSegmentWaypoints(200, 120, 480),
      },
    ];

    const lanes = computeParallelLaneCenters(drafts);
    expect(lanes.get('a')?.centerY).toBe(200 - PARALLEL_EDGE_GAP / 2);
    expect(lanes.get('b')?.centerY).toBe(200 + PARALLEL_EDGE_GAP / 2);
    expect(Math.abs(lanes.get('a')!.centerY! - lanes.get('b')!.centerY!)).toBe(
      PARALLEL_EDGE_GAP,
    );
  });

  it('does not offset edges on different horizontal corridors', () => {
    const drafts: EdgeRouteDraft[] = [
      {
        edgeId: 'a',
        needsRouting: true,
        center: { centerY: 200 },
        waypoints: hSegmentWaypoints(200, 100, 500),
      },
      {
        edgeId: 'b',
        needsRouting: true,
        center: { centerY: 280 },
        waypoints: hSegmentWaypoints(280, 100, 500),
      },
    ];

    const lanes = computeParallelLaneCenters(drafts);
    expect(lanes.get('a')?.centerY).toBe(200);
    expect(lanes.get('b')?.centerY).toBe(280);
  });

  it('ignores non-routed edges', () => {
    const drafts: EdgeRouteDraft[] = [
      {
        edgeId: 'a',
        needsRouting: false,
        center: {},
        waypoints: hSegmentWaypoints(200, 100, 500),
      },
      {
        edgeId: 'b',
        needsRouting: true,
        center: { centerY: 200 },
        waypoints: hSegmentWaypoints(200, 120, 480),
      },
    ];

    const lanes = computeParallelLaneCenters(drafts);
    expect(lanes.has('a')).toBe(false);
    expect(lanes.get('b')?.centerY).toBe(200);
  });
});
