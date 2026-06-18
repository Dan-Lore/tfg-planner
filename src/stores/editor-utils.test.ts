import { describe, expect, it } from 'vitest';
import type { FlowResult } from '@/calculator/flow-solver';
import type { TfgpNode } from '@/schema/tfgp';
import { applyFlowResult } from './editor-utils';

const node: TfgpNode = {
  id: 'n1',
  machineId: 'm1',
  recipeId: 'r1',
  position: { x: 0, y: 0 },
  machineCount: 4,
  overclock: 1,
  parallel: 1,
  outputMultiplier: 1,
};

const result: FlowResult = {
  edgeFlows: {},
  edgeTargetFlows: {},
  nodeOutputRates: {},
  nodeInputRates: {},
  nodeSurplus: {},
  nodeMachineCounts: { n1: 9 },
};

describe('applyFlowResult', () => {
  it('preserve mode keeps manual machine counts', () => {
    const out = applyFlowResult([node], result, 'preserve');
    expect(out[0]!.machineCount).toBe(4);
  });

  it('full mode applies solver machine counts across scheme', () => {
    const out = applyFlowResult([node], result, 'full');
    expect(out[0]!.machineCount).toBe(9);
  });
});
