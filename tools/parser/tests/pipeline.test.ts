import { describe, it, expect } from 'vitest';
import { RecipeStore } from '../src/pipeline/recipe-store.js';
import { applyRemoves } from '../src/pipeline/apply-removes.js';
import { applyAdds } from '../src/pipeline/apply-adds.js';
import { applyPatches } from '../src/pipeline/apply-patches.js';
import { mirrorChemReactorToLcr } from '../src/pipeline/mirror-lcr.js';
import { sanitizeAllFlows } from '../src/pipeline/sanitize-flows.js';
import type { RecipeOp } from '../src/types.js';

describe('recipe pipeline', () => {
  it('removes override substrate then adds replacement', () => {
    const store = new RecipeStore();
    store.set({
      id: 'gtceu:centrifuge/uranium_238_separation',
      machineId: 'gtceu:centrifuge',
      inputs: [],
      outputs: [],
      durationTicks: 20,
      source: 'substrate',
    });

    const removes = [{ id: 'gtceu:centrifuge/uranium_238_separation' }];
    applyRemoves(store, removes);

    const add: RecipeOp = {
      id: 'tfg:uranium_238_separation',
      machineId: 'gtceu:centrifuge',
      inputs: [{ itemId: '#forge:dusts/uranium', amount: 1 }],
      outputs: [{ itemId: '#forge:tiny_dusts/uranium_235', amount: 1 }],
      durationTicks: 800,
      source: 'kubejs',
    };
    applyAdds(store, [add], removes);

    expect(store.has('gtceu:centrifuge/uranium_238_separation')).toBe(false);
    expect(store.get('tfg:uranium_238_separation')).toBeDefined();
  });

  it('sanitizeFlows preserves chance on normalized flows', () => {
    const recipes: RecipeOp[] = [
      {
        id: 'test:chanced',
        machineId: 'gtceu:greenhouse',
        inputs: [],
        outputs: [{ itemId: '2x tfc:wood/log/pine', amount: 1, chance: 750 }],
        durationTicks: 20,
        source: 'test',
      },
    ];
    const [fixed] = sanitizeAllFlows(recipes);
    expect(fixed?.outputs).toEqual([{ itemId: 'tfc:wood/log/pine', amount: 2, chance: 750 }]);
  });

  it('sanitizeFlows normalizes malformed itemId prefixes', () => {
    const recipes: RecipeOp[] = [
      {
        id: 'test:malformed',
        machineId: 'minecraft:shaped',
        inputs: [{ itemId: '4x create:track_signal', amount: 1 }],
        outputs: [{ itemId: '2x gtceu:copper_dust', amount: 1 }],
        durationTicks: 20,
        source: 'test',
      },
    ];
    const [fixed] = sanitizeAllFlows(recipes);
    expect(fixed?.inputs).toEqual([{ itemId: 'create:track_signal', amount: 4 }]);
    expect(fixed?.outputs).toEqual([{ itemId: 'gtceu:copper_dust', amount: 2 }]);
  });

  it('applyPatches renames recipe and updates duration', () => {
    const store = new RecipeStore();
    store.set({
      id: 'gtceu:pyrolyse_oven/log_to_creosote',
      machineId: 'gtceu:pyrolyse_oven',
      inputs: [{ itemId: '#minecraft:logs', amount: 16 }],
      outputs: [
        { itemId: 'minecraft:charcoal', amount: 20 },
        { fluidId: 'gtceu:creosote', amount: 4000 },
      ],
      durationTicks: 400,
      source: 'substrate',
    });

    applyPatches(store, [
      {
        recipeId: 'gtceu:pyrolyse_oven/log_to_creosote',
        newId: 'tfg:pyrolyse_oven/log_to_creosote',
        durationTicks: 1280,
        source: 'test',
      },
    ]);

    expect(store.has('gtceu:pyrolyse_oven/log_to_creosote')).toBe(false);
    const patched = store.get('tfg:pyrolyse_oven/log_to_creosote');
    expect(patched?.durationTicks).toBe(1280);
    expect(patched?.outputs).toEqual(
      expect.arrayContaining([{ fluidId: 'gtceu:creosote', amount: 4000 }]),
    );
  });

  it('mod+input remove does not delete unrelated gtceu recipes', () => {
    const store = new RecipeStore();
    store.set({
      id: 'gtceu:pyrolyse_oven/log_to_charcoal_byproducts',
      machineId: 'gtceu:pyrolyse_oven',
      inputs: [{ itemId: '#minecraft:logs_that_burn', amount: 16 }],
      outputs: [
        { itemId: 'minecraft:charcoal', amount: 20 },
        { fluidId: 'gtceu:charcoal_byproducts', amount: 4000 },
      ],
      durationTicks: 320,
      source: 'substrate',
    });
    store.set({
      id: 'gtceu:alloy_blast_smelter/rocket_alloy_t2',
      machineId: 'gtceu:alloy_blast_smelter',
      inputs: [{ itemId: 'gtceu:hot_rocket_alloy_t2_ingot', amount: 1 }],
      outputs: [],
      durationTicks: 100,
      source: 'substrate',
    });

    applyRemoves(store, [{ mod: 'gtceu', input: 'gtceu:hot_rocket_alloy_t2_ingot' }]);

    expect(store.has('gtceu:pyrolyse_oven/log_to_charcoal_byproducts')).toBe(true);
    expect(store.has('gtceu:alloy_blast_smelter/rocket_alloy_t2')).toBe(false);
  });

  it('mirrorChemReactorToLcr duplicates chemical recipes for LCR machine', () => {
    const chem: RecipeOp = {
      id: 'tfg:aromatic_feedstock',
      machineId: 'gtceu:chemical_reactor',
      inputs: [{ fluidId: 'tfg:raw_aromatic_mix', amount: 4000 }],
      outputs: [{ fluidId: 'tfg:aromatic_feedstock', amount: 2000 }],
      durationTicks: 600,
      source: 'kubejs',
    };
    const mirrors = mirrorChemReactorToLcr([chem]);
    expect(mirrors).toHaveLength(1);
    expect(mirrors[0]?.id).toBe('tfg:aromatic_feedstock@lcr');
    expect(mirrors[0]?.machineId).toBe('gtceu:large_chemical_reactor');
  });

  it('mirrorChemReactorToLcr skips mirror when native LCR suffix exists', () => {
    const chem: RecipeOp = {
      id: 'gtceu:chemical_reactor/ptfe_from_air',
      machineId: 'gtceu:chemical_reactor',
      inputs: [{ fluidId: '#forge:air', amount: 1 }],
      outputs: [{ fluidId: 'gtceu:polytetrafluoroethylene', amount: 1 }],
      durationTicks: 100,
      source: 'substrate',
    };
    const lcr: RecipeOp = {
      ...chem,
      id: 'gtceu:large_chemical_reactor/ptfe_from_air',
      machineId: 'gtceu:large_chemical_reactor',
    };
    expect(mirrorChemReactorToLcr([chem, lcr])).toHaveLength(0);
  });
});
