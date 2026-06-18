import { describe, expect, it } from 'vitest';
import {
  FLOW_EDGE_LABEL_PORT_GAP,
  flowEdgeLabelCenterOffsetFromTextWidth,
  measureFlowEdgeLabelTextWidth,
} from '@/lib/flow-edge-label-metrics';

describe('flow-edge-label-metrics', () => {
  it('offsets center by port gap plus half text width', () => {
    expect(flowEdgeLabelCenterOffsetFromTextWidth(20)).toBe(
      FLOW_EDGE_LABEL_PORT_GAP + 10,
    );
    expect(flowEdgeLabelCenterOffsetFromTextWidth(0)).toBe(
      FLOW_EDGE_LABEL_PORT_GAP,
    );
  });

  it('orders wider rate strings further from the port', () => {
    const narrow = measureFlowEdgeLabelTextWidth('6/s');
    const wide = measureFlowEdgeLabelTextWidth('8000/s');
    const precise = measureFlowEdgeLabelTextWidth('0.0033/s');

    expect(wide).toBeGreaterThan(narrow);
    expect(precise).toBeGreaterThan(narrow);
    expect(flowEdgeLabelCenterOffsetFromTextWidth(wide)).toBeGreaterThan(
      flowEdgeLabelCenterOffsetFromTextWidth(narrow),
    );
  });
});
