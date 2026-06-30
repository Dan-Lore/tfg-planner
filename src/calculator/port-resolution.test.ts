import { describe, expect, it } from 'vitest';
import { minimalPack } from '@/test-fixtures/minimal-pack';
import type { PortEdge } from '@/calculator/port-resolution';
import {
  portInputDemandRate,
  resolveSourceOutputPort,
  resolveTargetInputPort,
} from '@/calculator/port-resolution';
import { R } from '@/calculator/rational';
import { buildTagIndex } from '@/lib/tag-index';

describe('port-resolution', () => {
  const recipe = minimalPack.recipes[0]!;
  const tags = buildTagIndex(minimalPack);

  it('resolves explicit target port', () => {
    const edge: PortEdge = { targetPort: 'in_0', itemId: 'iron_ingot' };
    expect(resolveTargetInputPort(edge, recipe, tags)).toBe('in_0');
  });

  it('resolves source port by product key', () => {
    const out = recipe.outputs[0]!;
    const edge: PortEdge = {
      itemId: out.itemId,
      fluidId: out.fluidId,
    };
    expect(resolveSourceOutputPort(edge, recipe)).toBe('out_0');
  });

  it('computes port input demand from primary output rate', () => {
    const demand = portInputDemandRate(recipe, 0, R.from(2));
    expect(demand.toNumber()).toBeGreaterThan(0);
  });
});
