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

/** Smoke chains for TFG-Modern 0.12.8 full RecipeManager export (aromatic chain). */
export const SMOKE_CHAINS_0_12_8: SmokeChain[] = [
  {
    id: 'greenhouse-pine-sapling',
    recipeId: 'tfg:tfc_wood_sapling_pine/1',
    expectMachine: 'gtceu:greenhouse',
    expectInputItem: 'tfc:wood/sapling/pine',
    expectOutputItem: 'tfc:wood/log/pine',
  },
  {
    id: 'pyrolyse-log-wood-tar-nitrogen',
    recipeId: 'tfg:pyrolyse_oven/log_to_wood_tar_nitrogen',
    expectMachine: 'gtceu:pyrolyse_oven',
    expectOutputFluid: 'gtceu:wood_tar',
  },
  {
    id: 'pyrolyse-log-creosote-nitrogen',
    recipeId: 'tfg:pyrolyse_oven/log_to_creosote_nitrogen',
    expectMachine: 'gtceu:pyrolyse_oven',
    expectOutputFluid: 'gtceu:creosote',
  },
  {
    id: 'liquefaction-aromatic-charcoal-hydrogen',
    recipeId: 'tfg:raw_aromatic_mix_charcoal_hydrogen',
    expectMachine: 'gtceu:coal_liquefaction_tower',
    expectInputItem: 'minecraft:charcoal',
    expectOutputFluid: 'tfg:raw_aromatic_mix',
  },
  {
    id: 'distill-wood-tar',
    recipeId: 'gtceu:distillation_tower/distill_wood_tar',
    expectMachine: 'gtceu:distillation_tower',
    expectInputFluid: '#forge:wood_tar',
  },
  {
    id: 'aromatic-feedstock-lcr',
    recipeId: 'tfg:aromatic_feedstock@lcr',
    expectMachine: 'gtceu:large_chemical_reactor',
    expectOutputFluid: 'tfg:aromatic_feedstock',
  },
  {
    id: 'electrolyze-syngas-lcr',
    recipeId: 'tfg:electrolyze_syngas@lcr',
    expectMachine: 'gtceu:large_chemical_reactor',
    expectInputFluid: 'tfg:syngas',
  },
  {
    id: 'reformed-aromatic-lcr',
    recipeId: 'tfg:reformed_aromatic_feedstock@lcr',
    expectMachine: 'gtceu:large_chemical_reactor',
    expectInputFluid: 'tfg:aromatic_feedstock',
    expectOutputFluid: 'tfg:reformed_aromatic_feedstock',
  },
  {
    id: 'reformate-gas-cracker',
    recipeId: 'tfg:reformate_gas_cracker',
    expectMachine: 'gtceu:cracker',
    expectInputFluid: 'tfg:reformed_aromatic_feedstock',
    expectOutputFluid: 'tfg:reformate_gas',
  },
  {
    id: 'methanol-distil-propylene',
    recipeId: 'tfg:methanol_distil_propylene',
    expectMachine: 'gtceu:distillation_tower',
    expectInputFluid: 'gtceu:methanol',
  },
  {
    id: 'pyrolyse-log-charcoal-byproducts',
    recipeId: 'gtceu:pyrolyse_oven/log_to_charcoal_byproducts',
    expectMachine: 'gtceu:pyrolyse_oven',
    expectOutputFluid: 'gtceu:charcoal_byproducts',
  },
  {
    id: 'wiremill-copper-8',
    recipeId: 'gtceu:wiremill/mill_copper_wire_8',
    expectMachine: 'gtceu:wiremill',
    expectInputItem: '#forge:ingots/copper',
    expectOutputItem: 'gtceu:copper_octal_wire',
  },
  {
    id: 'centrifuge-uranium-separation',
    recipeId: 'gtceu:centrifuge/uranium_238_separation',
    expectMachine: 'gtceu:centrifuge',
    expectOutputItem: 'gtceu:tiny_uranium_235_dust',
  },
  {
    id: 'snow-compressor',
    recipeId: 'gtceu:compressor/snowballs_to_snow',
    expectMachine: 'gtceu:compressor',
    expectInputItem: 'minecraft:snowball',
    expectOutputItem: 'minecraft:snow_block',
  },
  {
    id: 'distill-charcoal-byproducts',
    recipeId: 'gtceu:distillation_tower/distill_charcoal_byproducts',
    expectMachine: 'gtceu:distillation_tower',
    expectInputFluid: '#forge:charcoal_byproducts',
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
