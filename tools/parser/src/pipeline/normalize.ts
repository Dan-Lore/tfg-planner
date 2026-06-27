import type { PackData, Machine, ItemDef, Recipe } from '../../../../src/data/types.js';
import type { RecipeOp } from '../types.js';
import type { LangBundle } from '../lang/types.js';
import { resolveMachineName, resolveResourceName } from '../lang/resolve-name.js';
import { isMultiblockMachineId } from '../../../../src/calculator/gt-multiblock.js';
import { nativeTierForMachine } from '../gt-machine-tiers.js';
import { extractCircuitFromFlows } from './extract-circuit.js';
import { createProgressReporter, logStage } from '../progress.js';

function collectIds(recipes: RecipeOp[]): { items: Set<string>; fluids: Set<string>; machines: Set<string> } {
  const items = new Set<string>();
  const fluids = new Set<string>();
  const machines = new Set<string>();
  for (const r of recipes) {
    machines.add(r.machineId);
    for (const f of [...r.inputs, ...r.outputs]) {
      if (f.itemId) items.add(f.itemId);
      if (f.fluidId) fluids.add(f.fluidId);
    }
  }
  return { items, fluids, machines };
}

export function normalizePack(
  recipes: RecipeOp[],
  modpackVersion: string,
  dataVersion: number,
  lang?: LangBundle,
): PackData {
  const { items, fluids, machines } = collectIds(recipes);

  const machineMap = new Map<string, Machine>();
  const machineRecipeIds = new Map<string, Set<string>>();
  for (const id of machines) {
    const machine: Machine = {
      id,
      names: lang ? resolveMachineName(id, lang) : resolveResourceName(id, { ru: {}, en: {} }),
      category: id.startsWith('gtceu:') ? 'gregtech' : 'crafting',
      recipeIds: [],
    };
    if (isMultiblockMachineId(id)) machine.kind = 'multiblock';
    else if (id.startsWith('gtceu:') || id.startsWith('gt:')) machine.kind = 'singleblock';
    const nativeTier = nativeTierForMachine(id);
    if (nativeTier) machine.nativeTier = nativeTier;
    machineMap.set(id, machine);
  }

  const progress = createProgressReporter('Normalizing recipes', { every: 5000, intervalMs: 15_000 });
  const normalizedRecipes: Recipe[] = new Array(recipes.length);
  for (let i = 0; i < recipes.length; i++) {
    const r = recipes[i];
    const m = machineMap.get(r.machineId);
    if (m) {
      let ids = machineRecipeIds.get(r.machineId);
      if (!ids) {
        ids = new Set<string>();
        machineRecipeIds.set(r.machineId, ids);
      }
      if (!ids.has(r.id)) {
        ids.add(r.id);
        m.recipeIds.push(r.id);
      }
    }

    const { productInputs, circuitConfiguration } = extractCircuitFromFlows(r.inputs);
    const recipe: Recipe = {
      id: r.id,
      machineId: r.machineId,
      inputs: productInputs.map((f) => ({ ...f })),
      outputs: r.outputs.map((f) => ({ ...f })),
      durationTicks: r.durationTicks,
    };
    if (r.energy) recipe.energy = { ...r.energy };
    const circuit = r.circuitConfiguration ?? circuitConfiguration;
    if (circuit !== undefined) recipe.circuitConfiguration = circuit;
    normalizedRecipes[i] = recipe;
    progress.tick(i + 1, recipes.length);
  }
  progress.done(normalizedRecipes.length);

  const nameFor = (id: string) =>
    lang ? resolveResourceName(id, lang) : resolveResourceName(id, { ru: {}, en: {} });

  logStage(`Building item/fluid defs (${items.size} items, ${fluids.size} fluids)…`);
  const sortedItems = [...items].sort();
  const sortedFluids = [...fluids].sort();
  const itemProgress = createProgressReporter('Item defs', { every: 3000, intervalMs: 15_000 });
  const itemDefs: ItemDef[] = sortedItems.map((id, i) => {
    itemProgress.tick(i + 1, sortedItems.length);
    return { id, names: nameFor(id) };
  });
  itemProgress.done(itemDefs.length);
  const fluidProgress = createProgressReporter('Fluid defs', { every: 500, intervalMs: 15_000 });
  const fluidDefs: ItemDef[] = sortedFluids.map((id, i) => {
    fluidProgress.tick(i + 1, sortedFluids.length);
    return { id, names: nameFor(id) };
  });
  fluidProgress.done(fluidDefs.length);

  logStage('Sorting machines and recipes…');
  return {
    format: 'tfg-pack-data',
    formatVersion: 1,
    modpackVersion,
    dataVersion,
    generatedAt: new Date().toISOString(),
    machines: [...machineMap.values()].sort((a, b) => a.id.localeCompare(b.id)),
    recipes: normalizedRecipes.sort((a, b) => a.id.localeCompare(b.id)),
    items: itemDefs,
    fluids: fluidDefs,
  };
}
