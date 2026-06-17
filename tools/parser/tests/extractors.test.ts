import { describe, it, expect } from 'vitest';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseKubeJsFile } from '../src/kubejs/parse-file.js';

const fixtures = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');

describe('KubeJS extractors', () => {
  it('extracts gtceu chemical_bath recipe', () => {
    const result = parseKubeJsFile(join(fixtures, 'gtceu-recipe.js'));
    const cool = result.recipes.find((r) => r.id === 'tfg:magnesium_diboride_cool_down');
    expect(cool).toBeDefined();
    expect(cool?.machineId).toBe('gtceu:chemical_bath');
    expect(cool?.durationTicks).toBe(400);
    expect(cool?.energy?.euPerTick).toBe(120);
    expect(cool?.inputs).toEqual(
      expect.arrayContaining([
        { itemId: 'gtceu:hot_magnesium_diboride_ingot', amount: 1 },
        { fluidId: 'minecraft:water', amount: 100 },
      ]),
    );
  });

  it('extracts removes by id and mod', () => {
    const result = parseKubeJsFile(join(fixtures, 'remove-recipe.js'));
    expect(result.removes.some((r) => r.id === 'gtceu:centrifuge/uranium_238_separation')).toBe(true);
    expect(result.removes.some((r) => r.mod === 'gtceu')).toBe(true);
  });

  it('extracts shaped and smelting with .id()', () => {
    const result = parseKubeJsFile(join(fixtures, 'shaped-recipe.js'));
    const shaped = result.recipes.find((r) => r.id === 'tfg:shaped/mv_chemical_bath');
    expect(shaped?.machineId).toBe('minecraft:shaped');
    const smelt = result.recipes.find((r) => r.id === 'tfg:revert_annealed_copper_ingot');
    expect(smelt?.machineId).toBe('minecraft:smelting');
  });

  it('parses Nx prefix in shaped output', () => {
    const result = parseKubeJsFile(join(fixtures, 'shaped-recipe.js'));
    const fourX = result.recipes.find((r) => r.id === 'tfg:test/4x_output');
    expect(fourX?.outputs).toEqual([{ itemId: 'create:track_signal', amount: 4 }]);
  });

  it('expands generateMixerRecipe helper', () => {
    const result = parseKubeJsFile(join(fixtures, 'mixer-helper.js'));
    const mixer = result.recipes.find((r) => r.id === 'gtceu:drilling_fluid');
    expect(mixer?.machineId).toBe('gtceu:mixer');
    expect(mixer?.durationTicks).toBe(40);
    expect(mixer?.energy?.euPerTick).toBe(16);
  });
});
