import type { PackData } from '../../../../src/data/types.js';

export interface SmokeChain {
  id: string;
  recipeId: string;
  expectOutputItem?: string;
  expectMachine?: string;
}

/** Smoke chains calibrated for TFG-Modern 0.12.8 KubeJS overrides. */
export const SMOKE_CHAINS_0_12_8: SmokeChain[] = [
  {
    id: 'copper-centrifuge',
    recipeId: 'tfg:uranium_238_separation',
    expectOutputItem: '#forge:tiny_dusts/uranium_235',
    expectMachine: 'gtceu:centrifuge',
  },
  {
    id: 'mv-chemical-bath-shaped',
    recipeId: 'tfg:shaped/mv_chemical_bath',
    expectMachine: 'minecraft:shaped',
  },
  {
    id: 'magnesium-diboride-cool',
    recipeId: 'tfg:magnesium_diboride_cool_down',
    expectMachine: 'gtceu:chemical_bath',
  },
  {
    id: 'snow-compressor-fix',
    recipeId: 'gtceu:compressor/snowballs_to_snow_fixed',
    expectMachine: 'gtceu:compressor',
  },
  {
    id: 'diluted-hcl',
    recipeId: 'tfg:diluted_hcl_acid',
    expectMachine: 'gtceu:mixer',
  },
];

export function runSmokeChains(
  pack: PackData,
  chains: SmokeChain[] = SMOKE_CHAINS_0_12_8,
): { id: string; ok: boolean; reason?: string }[] {
  const byId = new Map(pack.recipes.map((r) => [r.id, r]));
  return chains.map((chain) => {
    const recipe = byId.get(chain.recipeId);
    if (!recipe) {
      return { id: chain.id, ok: false, reason: `Recipe ${chain.recipeId} not in pack` };
    }
    if (chain.expectMachine && recipe.machineId !== chain.expectMachine) {
      return {
        id: chain.id,
        ok: false,
        reason: `Expected machine ${chain.expectMachine}, got ${recipe.machineId}`,
      };
    }
    if (chain.expectOutputItem) {
      const has = recipe.outputs.some((o) => o.itemId === chain.expectOutputItem);
      if (!has) {
        return {
          id: chain.id,
          ok: false,
          reason: `Missing output ${chain.expectOutputItem}`,
        };
      }
    }
    return { id: chain.id, ok: true };
  });
}
