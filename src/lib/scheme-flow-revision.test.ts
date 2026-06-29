import { describe, expect, it } from 'vitest';
import { schemeFlowRevision } from '@/lib/scheme-flow-revision';
import type { TfgpFile, TfgpMachineNode } from '@/schema/tfgp';

function scheme(nodes: TfgpMachineNode[]): TfgpFile {
  const now = new Date(0).toISOString();
  return {
    format: 'tfg-planner-graph',
    formatVersion: 1,
    modpack: { version: '0.12.8', dataVersion: 1 },
    meta: { name: 't', author: 'a', createdAt: now, updatedAt: now, description: '' },
    nodes,
    edges: [],
    groups: [],
    targets: [],
    viewport: { x: 0, y: 0, zoom: 1 },
  };
}

const baseNode: TfgpMachineNode = {
  id: 'n1',
  position: { x: 0, y: 0 },
  machineId: 'gt_machine',
  recipeId: 'r1',
  voltageTier: 'LV',
  overclock: 1,
  parallel: 1,
  machineCount: 1,
};

describe('schemeFlowRevision', () => {
  it('ignores node position changes', () => {
    const base = scheme([baseNode]);
    const moved = scheme([
      {
        ...baseNode,
        position: { x: 400, y: 220 },
      },
    ]);
    expect(schemeFlowRevision(moved)).toBe(schemeFlowRevision(base));
  });

  it('changes when machine count changes', () => {
    const a = scheme([baseNode]);
    const b = scheme([
      {
        ...baseNode,
        machineCount: 2,
      },
    ]);
    expect(schemeFlowRevision(b)).not.toBe(schemeFlowRevision(a));
  });
});
