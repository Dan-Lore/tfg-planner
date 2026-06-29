import { describe, expect, it } from 'vitest';
import type { Recipe } from '@/data/types';
import {
  CHEM_MACHINE,
  LCR_MACHINE,
  dedupeAttachCandidates,
  dedupeRecipesForDisplay,
  normalizeRecipeCanon,
  pickCanonicalRecipe,
  recipeDisplayGroupKey,
  recipePathSuffix,
} from '@/lib/recipe-canon';

function ptfeBody(machineId: string, id: string): Recipe {
  return {
    id,
    machineId,
    inputs: [
      { fluidId: '#forge:air', amount: 2000 },
      { fluidId: '#forge:tetrafluoroethylene', amount: 144 },
    ],
    outputs: [{ fluidId: 'gtceu:polytetrafluoroethylene', amount: 144 }],
    durationTicks: 200,
  };
}

describe('recipe-canon', () => {
  it('extracts path suffix from ids with slashes and @lcr', () => {
    expect(recipePathSuffix('gtceu:chemical_reactor/ptfe_from_air@lcr')).toBe('ptfe_from_air');
    expect(recipePathSuffix('gtceu:large_chemical_reactor/ptfe_from_air')).toBe('ptfe_from_air');
  });

  it('groups chem, LCR native, and @lcr mirror separately by machine slot', () => {
    const chem = ptfeBody(CHEM_MACHINE, 'gtceu:chemical_reactor/ptfe_from_air');
    const lcr = ptfeBody(LCR_MACHINE, 'gtceu:large_chemical_reactor/ptfe_from_air');
    const mirror = ptfeBody(LCR_MACHINE, 'gtceu:chemical_reactor/ptfe_from_air@lcr');
    expect(recipeDisplayGroupKey(chem)).not.toBe(recipeDisplayGroupKey(lcr));
    expect(recipeDisplayGroupKey(lcr)).toBe(recipeDisplayGroupKey(mirror));
  });

  it('normalizeRecipeCanon keeps chem + LCR native, drops @lcr mirror', () => {
    const chem = ptfeBody(CHEM_MACHINE, 'gtceu:chemical_reactor/ptfe_from_air');
    const lcr = ptfeBody(LCR_MACHINE, 'gtceu:large_chemical_reactor/ptfe_from_air');
    const mirror = ptfeBody(LCR_MACHINE, 'gtceu:chemical_reactor/ptfe_from_air@lcr');
    const { recipes, removedIds } = normalizeRecipeCanon([chem, lcr, mirror]);
    expect(recipes).toHaveLength(2);
    expect(recipes.map((r) => r.id).sort()).toEqual([
      'gtceu:chemical_reactor/ptfe_from_air',
      'gtceu:large_chemical_reactor/ptfe_from_air',
    ]);
    expect(removedIds).toEqual(['gtceu:chemical_reactor/ptfe_from_air@lcr']);
  });

  it('pickCanonicalRecipe prefers native LCR over @lcr', () => {
    const lcr = ptfeBody(LCR_MACHINE, 'gtceu:large_chemical_reactor/ptfe_from_air');
    const mirror = ptfeBody(LCR_MACHINE, 'gtceu:chemical_reactor/ptfe_from_air@lcr');
    expect(pickCanonicalRecipe([mirror, lcr]).id).toBe(lcr.id);
  });

  it('dedupeRecipesForDisplay filters to machineId', () => {
    const chem = ptfeBody(CHEM_MACHINE, 'gtceu:chemical_reactor/ptfe_from_air');
    const lcr = ptfeBody(LCR_MACHINE, 'gtceu:large_chemical_reactor/ptfe_from_air');
    const mirror = ptfeBody(LCR_MACHINE, 'gtceu:chemical_reactor/ptfe_from_air@lcr');
    const lcrOnly = dedupeRecipesForDisplay([chem, lcr, mirror], { machineId: LCR_MACHINE });
    expect(lcrOnly).toHaveLength(1);
    expect(lcrOnly[0]!.id).toBe('gtceu:large_chemical_reactor/ptfe_from_air');
  });

  it('dedupeAttachCandidates prefers native LCR over @lcr mirror', () => {
    const lcr = ptfeBody(LCR_MACHINE, 'gtceu:large_chemical_reactor/ptfe_from_air');
    const mirror = ptfeBody(LCR_MACHINE, 'gtceu:chemical_reactor/ptfe_from_air@lcr');
    const out = dedupeAttachCandidates([
      {
        machineId: LCR_MACHINE,
        portId: 'out_0',
        recipeId: mirror.id,
        recipe: mirror,
      },
      {
        machineId: LCR_MACHINE,
        portId: 'out_0',
        recipeId: lcr.id,
        recipe: lcr,
      },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]!.recipeId).toBe(lcr.id);
  });
});
