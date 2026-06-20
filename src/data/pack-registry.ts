import type { PackData, PackManifest, Recipe } from './types';
import { publicPath } from '@/lib/public-path';

export async function loadManifest(): Promise<PackManifest> {
  const res = await fetch(publicPath('/data/packs/manifest.json'));
  if (!res.ok) throw new Error('Failed to load pack manifest');
  return res.json() as Promise<PackManifest>;
}

export async function loadPackData(path: string): Promise<PackData> {
  const res = await fetch(publicPath(path));
  if (!res.ok) throw new Error(`Failed to load pack: ${path}`);
  return res.json() as Promise<PackData>;
}

export function getItemName(
  pack: PackData,
  itemId: string,
  lang: 'ru' | 'en',
): string {
  const item = pack.items.find((i) => i.id === itemId);
  if (item) return item.names[lang] ?? item.names.en;
  const fluid = pack.fluids.find((f) => f.id === itemId);
  if (fluid) return fluid.names[lang] ?? fluid.names.en;
  return itemId;
}

export function getMachineName(
  pack: PackData,
  machineId: string,
  lang: 'ru' | 'en',
): string {
  const m = pack.machines.find((x) => x.id === machineId);
  return m ? (m.names[lang] ?? m.names.en) : machineId;
}

const recipesByMachineCache = new WeakMap<PackData, Map<string, Recipe[]>>();

function recipesByMachineIndex(pack: PackData): Map<string, Recipe[]> {
  let index = recipesByMachineCache.get(pack);
  if (!index) {
    index = new Map<string, Recipe[]>();
    for (const recipe of pack.recipes) {
      const list = index.get(recipe.machineId);
      if (list) list.push(recipe);
      else index.set(recipe.machineId, [recipe]);
    }
    recipesByMachineCache.set(pack, index);
  }
  return index;
}

export function getMachineRecipeCount(pack: PackData, machineId: string): number {
  return recipesByMachineIndex(pack).get(machineId)?.length ?? 0;
}

export function getRecipesForMachine(pack: PackData, machineId: string): Recipe[] {
  return recipesByMachineIndex(pack).get(machineId) ?? [];
}
