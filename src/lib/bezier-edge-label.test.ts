import { describe, expect, it } from 'vitest';
import { Position } from '@xyflow/react';
import {
  EDGE_LABEL_NEAR_SOURCE,
  EDGE_LABEL_NEAR_TARGET,
  edgeLabelPosition,
  pointOnBezierEdge,
} from '@/lib/bezier-edge-label';
import { flowEdgeLabelCenterOffsetFromTextWidth, measureFlowEdgeLabelTextWidth } from '@/lib/flow-edge-label-metrics';

describe('pointOnBezierEdge', () => {
  it('places near-source and near-target on the same curve', () => {
    const params = {
      sourceX: 0,
      sourceY: 100,
      targetX: 300,
      targetY: 40,
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    };
    const nearSource = pointOnBezierEdge(params, EDGE_LABEL_NEAR_SOURCE);
    const nearTarget = pointOnBezierEdge(params, EDGE_LABEL_NEAR_TARGET);

    expect(nearSource.x).toBeGreaterThan(params.sourceX);
    expect(nearSource.x).toBeLessThan(params.targetX);
    expect(nearTarget.x).toBeGreaterThan(nearSource.x);
    expect(nearTarget.x).toBeLessThanOrEqual(params.targetX);
  });

  it('pulls label X closer to the handle horizontally on long edges', () => {
    const params = {
      sourceX: 100,
      sourceY: 100,
      targetX: 400,
      targetY: 40,
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    };
    const onEdge = pointOnBezierEdge(params, EDGE_LABEL_NEAR_TARGET);
    const label = edgeLabelPosition(params, 'target', '12.00/s');

    expect(label.y).toBe(onEdge.y);
    expect(label.x).toBeGreaterThan(onEdge.x);
    expect(label.x).toBeLessThanOrEqual(params.targetX);
  });

  it('keeps labels outside node boxes on short horizontal edges', () => {
    const labelText = '8.00/s';
    const clearance = flowEdgeLabelCenterOffsetFromTextWidth(
      measureFlowEdgeLabelTextWidth(labelText),
    );
    const params = {
      sourceX: 400,
      sourceY: 120,
      targetX: 470,
      targetY: 120,
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    };

    const sourceLabel = edgeLabelPosition(params, 'source', labelText);
    const targetLabel = edgeLabelPosition(params, 'target', labelText);

    expect(sourceLabel.x).toBeGreaterThanOrEqual(params.sourceX + clearance);
    expect(targetLabel.x).toBeLessThanOrEqual(params.targetX - clearance);
  });

  it('pushes wider labels further from the port on short edges', () => {
    const params = {
      sourceX: 400,
      sourceY: 120,
      targetX: 470,
      targetY: 120,
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    };

    const narrow = edgeLabelPosition(params, 'source', '6/s');
    const wide = edgeLabelPosition(params, 'source', '8000/s');

    expect(wide.x).toBeGreaterThan(narrow.x);
  });
});
