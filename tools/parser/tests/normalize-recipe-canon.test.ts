import { describe, expect, it } from 'vitest';
import type { RecipeOp } from '../src/types.js';
import { normalizeRecipeCanon } from '../src/pipeline/normalize-recipe-canon.js';
import { mirrorChemReactorToLcr } from '../src/pipeline/mirror-lcr.js';

function ptfe(machineId: string, id: string): RecipeOp {
  return {
    id,
    machineId,
    inputs: [
      { fluidId: '#forge:air', amount: 2000 },
      { fluidId: '#forge:tetrafluoroethylene', amount: 144 },
    ],
    outputs: [{ fluidId: 'gtceu:polytetrafluoroethylene', amount: 144 }],
    durationTicks: 200,
    source: 'test',
  };
}

describe('normalizeRecipeCanon (parser)', () => {
  it('drops @lcr mirror when native LCR recipe exists', () => {
    const recipes = [
      ptfe('gtceu:chemical_reactor', 'gtceu:chemical_reactor/ptfe_from_air'),
      ptfe('gtceu:large_chemical_reactor', 'gtceu:large_chemical_reactor/ptfe_from_air'),
      ptfe('gtceu:large_chemical_reactor', 'gtceu:chemical_reactor/ptfe_from_air@lcr'),
    ];
    const { recipes: out, removedIds } = normalizeRecipeCanon(recipes);
    expect(out).toHaveLength(2);
    expect(removedIds).toContain('gtceu:chemical_reactor/ptfe_from_air@lcr');
  });

  it('keeps single @lcr mirror when no native LCR suffix exists', () => {
    const chem: RecipeOp = {
      id: 'tfg:aromatic_feedstock',
      machineId: 'gtceu:chemical_reactor',
      inputs: [{ fluidId: 'tfg:raw_aromatic_mix', amount: 4000 }],
      outputs: [{ fluidId: 'tfg:aromatic_feedstock', amount: 2000 }],
      durationTicks: 600,
      source: 'test',
    };
    const mirrored = [...mirrorChemReactorToLcr([chem])];
    const { recipes: out } = normalizeRecipeCanon([chem, ...mirrored]);
    expect(out.some((r) => r.id === 'tfg:aromatic_feedstock@lcr')).toBe(true);
    expect(out.some((r) => r.id === 'tfg:aromatic_feedstock')).toBe(true);
  });
});
