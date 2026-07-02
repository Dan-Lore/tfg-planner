import { describe, expect, it } from 'vitest';
import { minimalPack } from '@/test-fixtures/minimal-pack';
import type { PortEdge } from '@/calculator/port-resolution';
import {
  portInputDemandRate,
  resolveSourceOutputPort,
  resolveTargetInputPort,
} from '@/calculator/port-resolution';
import { R } from '@/calculator/rational';
import { chanceRateMultiplier } from '@/lib/flow-chance';
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

  it('uses non-zero primary output index for demand denominator', () => {
    const multiOutRecipe = {
      id: 'multi',
      machineId: 'm',
      durationTicks: 100,
      inputs: [{ itemId: 'a', amount: 2 }],
      outputs: [
        { itemId: 'b', amount: 10 },
        { itemId: 'c', amount: 5 },
      ],
    } as typeof recipe;
    const rateAtPrimary = R.from(4);
    expect(portInputDemandRate(multiOutRecipe, 0, rateAtPrimary, 0).toNumber()).toBeCloseTo(
      0.8,
    );
    expect(portInputDemandRate(multiOutRecipe, 0, rateAtPrimary, 1).toNumber()).toBeCloseTo(
      1.6,
    );
  });

  it('applies chanced input multiplier to demand rate', () => {
    const chancedInputRecipe = {
      id: 'chanced_in',
      machineId: 'm',
      durationTicks: 100,
      inputs: [{ itemId: 'catalyst', amount: 1, chance: 1000 }],
      outputs: [{ fluidId: 'product', amount: 2000 }],
    } as typeof recipe;
    const rate = R.from(100);
    const demand = portInputDemandRate(chancedInputRecipe, 0, rate, 0);
    const demandUnc = portInputDemandRate(
      {
        ...chancedInputRecipe,
        inputs: [{ itemId: 'catalyst', amount: 1 }],
      },
      0,
      rate,
      0,
    );
    expect(demand.toNumber()).toBeCloseTo(demandUnc.toNumber() * 0.1, 5);
  });

  it('rhenium catalyst demand matches expected output at symmetric chance', () => {
    const reformedRecipe = {
      id: 'tfg:reformed_aromatic_feedstock@lcr',
      machineId: 'gtceu:large_chemical_reactor',
      durationTicks: 360,
      inputs: [
        { itemId: 'gtceu:tiny_rhenium_dust', amount: 1, chance: 1000 },
        { fluidId: 'tfg:aromatic_feedstock', amount: 2000 },
      ],
      outputs: [{ fluidId: 'tfg:reformed_aromatic_feedstock', amount: 2000 }],
    } as typeof recipe;

    const reformedRate = R.from(2000).div(R.from(18));
    const rhDemand = portInputDemandRate(reformedRecipe, 0, reformedRate, 0);
    const rhDemandUnchanced = portInputDemandRate(
      {
        ...reformedRecipe,
        inputs: [{ itemId: 'gtceu:tiny_rhenium_dust', amount: 1 }, reformedRecipe.inputs[1]!],
      },
      0,
      reformedRate,
      0,
    );
    expect(rhDemand.toNumber()).toBeCloseTo(rhDemandUnchanced.toNumber() * 0.1, 5);

    const rhPerReformedBatch = R.from(1).mul(chanceRateMultiplier(1000));
    const rhPerOffGasBatch = R.from(1).mul(chanceRateMultiplier(1000));
    expect(rhPerReformedBatch.toNumber()).toBeCloseTo(rhPerOffGasBatch.toNumber(), 5);
  });
});
