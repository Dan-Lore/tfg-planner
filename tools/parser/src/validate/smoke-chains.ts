import type { PackData } from '../../../../src/data/types.js';

export interface SmokeChain {
  id: string;
  recipeId: string;
  expectInputItem?: string;
  expectInputFluid?: string;
  expectOutputItem?: string;
  expectOutputFluid?: string;
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
  {
    id: 'reformed-aromatic-rhenium',
    recipeId: 'tfg:reformed_aromatic_feedstock',
    expectMachine: 'gtceu:chemical_reactor',
    expectInputItem: 'gtceu:tiny_rhenium_dust',
  },
  {
    id: 'cracker-off-gas-rhenium',
    recipeId: 'tfg:cracker_off_gas_recycling',
    expectMachine: 'gtceu:electrolyzer',
    expectOutputItem: 'gtceu:tiny_rhenium_dust',
  },
  {
    id: 'aromatic-lcr-mirror',
    recipeId: 'tfg:aromatic_feedstock@lcr',
    expectMachine: 'gtceu:large_chemical_reactor',
  },
  {
    id: 'pyrolyse-log-creosote-patched',
    recipeId: 'tfg:pyrolyse_oven/log_to_creosote',
    expectMachine: 'gtceu:pyrolyse_oven',
  },
  {
    id: 'pyrolyse-log-charcoal-byproducts',
    recipeId: 'gtceu:pyrolyse_oven/log_to_charcoal_byproducts',
    expectMachine: 'gtceu:pyrolyse_oven',
    expectOutputFluid: 'gtceu:charcoal_byproducts',
  },
  {
    id: 'distill-charcoal-byproducts',
    recipeId: 'gtceu:distill_charcoal_byproducts',
    expectMachine: 'gtceu:distillation_tower',
    expectInputFluid: 'gtceu:charcoal_byproducts',
  },
  {
    id: 'distill-wood-tar',
    recipeId: 'gtceu:distill_wood_tar',
    expectMachine: 'gtceu:distillation_tower',
    expectInputFluid: 'gtceu:wood_tar',
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
          reason: `Missing output item ${chain.expectOutputItem}`,
        };
      }
    }
    if (chain.expectOutputFluid) {
      const has = recipe.outputs.some((o) => o.fluidId === chain.expectOutputFluid);
      if (!has) {
        return {
          id: chain.id,
          ok: false,
          reason: `Missing output fluid ${chain.expectOutputFluid}`,
        };
      }
    }
    if (chain.expectInputItem) {
      const has = recipe.inputs.some((i) => i.itemId === chain.expectInputItem);
      if (!has) {
        return {
          id: chain.id,
          ok: false,
          reason: `Missing input item ${chain.expectInputItem}`,
        };
      }
    }
    if (chain.expectInputFluid) {
      const has = recipe.inputs.some((i) => i.fluidId === chain.expectInputFluid);
      if (!has) {
        return {
          id: chain.id,
          ok: false,
          reason: `Missing input fluid ${chain.expectInputFluid}`,
        };
      }
    }
    return { id: chain.id, ok: true };
  });
}
