import { describe, expect, it } from 'vitest';
import { schemeFlowRevision } from '@/lib/scheme-flow-revision';
import type { TfgpFile } from '@/schema/tfgp';

function scheme(nodes: TfgpFile['nodes']): TfgpFile {
  return {
    version: 1,
    modpack: { version: '0.12.8', dataVersion: 1 },
    meta: { name: 't', author: 'a', createdAt: '', updatedAt: '', description: '' },
    nodes,
    edges: [],
    targets: [],
    viewport: { x: 0, y: 0, zoom: 1 },
  };
}

describe('schemeFlowRevision', () => {
  it('ignores node position changes', () => {
    const base = scheme([
      {
        id: 'n1',
        position: { x: 0, y: 0 },
        machineId: 'gt_machine',
        recipeId: 'r1',
        voltageTier: 'LV',
        overclock: 1,
        parallel: 1,
        machineCount: 1,
      },
    ]);
    const moved = scheme([
      {
        ...base.nodes[0]!,
        position: { x: 400, y: 220 },
      },
    ]);
    expect(schemeFlowRevision(moved)).toBe(schemeFlowRevision(base));
  });

  it('changes when machine count changes', () => {
    const a = scheme([
      {
        id: 'n1',
        position: { x: 0, y: 0 },
        machineId: 'gt_machine',
        recipeId: 'r1',
        voltageTier: 'LV',
        overclock: 1,
        parallel: 1,
        machineCount: 1,
      },
    ]);
    const b = scheme([
      {
        ...a.nodes[0]!,
        machineCount: 2,
      },
    ]);
    expect(schemeFlowRevision(b)).not.toBe(schemeFlowRevision(a));
  });
});
