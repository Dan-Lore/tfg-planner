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

/** Smoke chains calibrated for TFG-Modern 0.12.8 server GT JSON snapshot. */
export const SMOKE_CHAINS_0_12_8: SmokeChain[] = [
  {
    id: 'copper-centrifuge',
    recipeId: 'gtceu:centrifuge/uranium_238_separation',
    expectOutputItem: 'gtceu:tiny_uranium_235_dust',
    expectMachine: 'gtceu:centrifuge',
  },
  {
    id: 'mv-chemical-bath-arc',
    recipeId: 'gtceu:arc_furnace/arc_mv_chemical_bath',
    expectMachine: 'gtceu:arc_furnace',
    expectInputItem: 'gtceu:mv_chemical_bath',
  },
  {
    id: 'magnesium-diboride-cool',
    recipeId: 'gtceu:vacuum_freezer/cool_hot_magnesium_diboride_ingot',
    expectMachine: 'gtceu:vacuum_freezer',
    expectInputItem: '#forge:hot_ingots/magnesium_diboride',
    expectOutputItem: 'gtceu:magnesium_diboride_ingot',
  },
  {
    id: 'snow-compressor-fix',
    recipeId: 'gtceu:compressor/snowballs_to_snow',
    expectMachine: 'gtceu:compressor',
  },
  {
    id: 'diluted-hcl',
    recipeId: 'gtceu:distillation_tower/distill_dilute_hcl',
    expectMachine: 'gtceu:distillation_tower',
    expectInputFluid: '#forge:diluted_hydrochloric_acid',
  },
  {
    id: 'mo-re-alloy-blast',
    recipeId: 'gtceu:alloy_blast_smelter/mo_50_re',
    expectMachine: 'gtceu:alloy_blast_smelter',
    expectInputItem: '#forge:dusts/rhenium',
    expectOutputFluid: 'tfg:mo_50_re',
  },
  {
    id: 'mo-re-electrolyzer',
    recipeId: 'gtceu:electrolyzer/decomposition_electrolyzing_mo_50_re',
    expectMachine: 'gtceu:electrolyzer',
    expectOutputItem: 'gtceu:rhenium_dust',
  },
  {
    id: 'phenol-lcr-shortcut',
    recipeId: 'gtceu:large_chemical_reactor/phenol_hcl_shortcut',
    expectMachine: 'gtceu:large_chemical_reactor',
    expectOutputFluid: 'gtceu:diluted_hydrochloric_acid',
  },
  {
    id: 'pyrolyse-log-creosote',
    recipeId: 'gtceu:pyrolyse_oven/log_to_creosote',
    expectMachine: 'gtceu:pyrolyse_oven',
    expectOutputFluid: 'gtceu:creosote',
  },
  {
    id: 'pyrolyse-log-charcoal-byproducts',
    recipeId: 'gtceu:pyrolyse_oven/log_to_charcoal_byproducts',
    expectMachine: 'gtceu:pyrolyse_oven',
    expectOutputFluid: 'gtceu:charcoal_byproducts',
  },
  {
    id: 'distill-charcoal-byproducts',
    recipeId: 'gtceu:distillation_tower/distill_charcoal_byproducts',
    expectMachine: 'gtceu:distillation_tower',
    expectInputFluid: '#forge:charcoal_byproducts',
  },
  {
    id: 'distill-wood-tar',
    recipeId: 'gtceu:distillation_tower/distill_wood_tar',
    expectMachine: 'gtceu:distillation_tower',
    expectInputFluid: '#forge:wood_tar',
  },
  {
    id: 'wiremill-copper-8',
    recipeId: 'gtceu:wiremill/mill_copper_wire_8',
    expectMachine: 'gtceu:wiremill',
    expectInputItem: '#forge:ingots/copper',
    expectOutputItem: 'gtceu:copper_octal_wire',
  },
  {
    id: 'distill-charcoal-to-wood-tar',
    recipeId: 'gtceu:distillery/distill_charcoal_byproducts_to_wood_tar',
    expectMachine: 'gtceu:distillery',
    expectInputFluid: '#forge:charcoal_byproducts',
    expectOutputFluid: 'gtceu:wood_tar',
  },
  {
    id: 'pyrolyse-log-creosote-nitrogen',
    recipeId: 'gtceu:pyrolyse_oven/log_to_creosote_nitrogen',
    expectMachine: 'gtceu:pyrolyse_oven',
    expectOutputFluid: 'gtceu:creosote',
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
