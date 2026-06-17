import { describe, it, expect } from 'vitest';
import { RecipeStore } from '../src/pipeline/recipe-store.js';
import { applyRemoves } from '../src/pipeline/apply-removes.js';
import { applyAdds } from '../src/pipeline/apply-adds.js';
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
});
