import type { PackData, Machine, ItemDef, Recipe } from '../../../../src/data/types.js';
import type { RecipeOp } from '../types.js';
import type { LangBundle } from '../lang/types.js';
import { resolveMachineName, resolveResourceName } from '../lang/resolve-name.js';

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
  for (const id of machines) {
    machineMap.set(id, {
      id,
      names: lang ? resolveMachineName(id, lang) : resolveResourceName(id, { ru: {}, en: {} }),
      category: id.startsWith('gtceu:') ? 'gregtech' : 'crafting',
      recipeIds: [],
    });
  }

  const normalizedRecipes: Recipe[] = recipes.map((r) => {
    const m = machineMap.get(r.machineId);
    if (m && !m.recipeIds.includes(r.id)) m.recipeIds.push(r.id);

    const recipe: Recipe = {
      id: r.id,
      machineId: r.machineId,
      inputs: r.inputs.map((f) => ({ ...f })),
      outputs: r.outputs.map((f) => ({ ...f })),
      durationTicks: r.durationTicks,
    };
    if (r.energy) recipe.energy = { ...r.energy };
    return recipe;
  });

  const nameFor = (id: string) =>
    lang ? resolveResourceName(id, lang) : resolveResourceName(id, { ru: {}, en: {} });

  const itemDefs: ItemDef[] = [...items].sort().map((id) => ({ id, names: nameFor(id) }));
  const fluidDefs: ItemDef[] = [...fluids].sort().map((id) => ({ id, names: nameFor(id) }));

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
