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

  it('extracts chancedInput and chancedOutput with Item.of', () => {
    const result = parseKubeJsFile(join(fixtures, 'early-gas-rhenium.js'));
    const reformed = result.recipes.find((r) => r.id === 'tfg:reformed_aromatic_feedstock');
    expect(reformed?.inputs).toEqual(
      expect.arrayContaining([
        { itemId: 'gtceu:tiny_rhenium_dust', amount: 1, chance: 1000 },
        { fluidId: 'tfg:aromatic_feedstock', amount: 2000 },
      ]),
    );
    const recycling = result.recipes.find((r) => r.id === 'tfg:cracker_off_gas_recycling');
    expect(recycling?.outputs).toEqual(
      expect.arrayContaining([
        { fluidId: 'gtceu:carbon_dioxide', amount: 500 },
        { fluidId: 'gtceu:hydrogen', amount: 500 },
        { itemId: 'gtceu:tiny_rhenium_dust', amount: 1, chance: 1000 },
      ]),
    );
  });

  it('extracts global.modifyRecipe and modifyRecipes helper patches', () => {
    const result = parseKubeJsFile(join(fixtures, 'modify-recipe.js'));
    expect(result.patches.length).toBeGreaterThanOrEqual(3);
    const creosote = result.patches.find(
      (p) => p.recipeId === 'gtceu:pyrolyse_oven/log_to_creosote',
    );
    expect(creosote?.newId).toBe('tfg:pyrolyse_oven/log_to_creosote');
    expect(creosote?.durationTicks).toBe(1280);
    const redAlloy = result.patches.find((p) => p.recipeId === 'gtceu:alloy_blast_smelter/red_alloy');
    expect(redAlloy?.newId).toBe('tfg:red_alloy');
    expect(redAlloy?.fluidOutputAmounts).toEqual({ 'gtceu:red_alloy': 720 });
  });

  it('expands generateGreenHouseRecipe and crop/tree helpers', () => {
    const result = parseKubeJsFile(join(fixtures, 'greenhouse-helper.js'));
    const bamboo = result.recipes.find(
      (r) => r.id === 'tfg:minecraft_bamboo/1' && r.machineId === 'gtceu:greenhouse',
    );
    expect(bamboo).toBeDefined();
    expect(bamboo?.durationTicks).toBe(12000);
    expect(bamboo?.outputs[1]?.chance).toBe(750);
    expect(bamboo?.inputs).toEqual(
      expect.arrayContaining([{ itemId: 'minecraft:bamboo', amount: 8 }]),
    );
    const wheat = result.recipes.find(
      (r) => r.id === 'tfg:tfc_plant_wheat/1' && r.machineId === 'gtceu:greenhouse',
    );
    expect(wheat).toBeDefined();
    expect(result.recipes.some((r) => r.machineId === 'gtceu:greenhouse')).toBe(true);
  });
});
