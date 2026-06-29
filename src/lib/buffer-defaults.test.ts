import { describe, expect, it } from 'vitest';
import { estimateBufferDefaults } from '@/lib/buffer-defaults';
import { R } from '@/calculator/rational';
import { emptyFlowResult } from '@/test/flow-result-fixture';

describe('estimateBufferDefaults', () => {
  it('derives capacity from port flow rate × 3600', () => {
    const flowResult = emptyFlowResult({
      edgeFlows: { e1: R.from(2.5) },
    });
    const defaults = estimateBufferDefaults(
      'n1',
      'out_0',
      'downstream',
      {
        edges: [
          {
            id: 'e1',
            source: 'n1',
            sourcePort: 'out_0',
            target: 'n2',
            targetPort: 'in_0',
            itemId: 'ore',
          },
        ],
      },
      flowResult,
    );
    expect(defaults.capacity).toBe(9000);
    expect(defaults.supplyRate).toBe(3);
  });
});
