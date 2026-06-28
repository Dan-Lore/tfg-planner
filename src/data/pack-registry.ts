import type { ActivePack } from './pack-runtime';
import type { PackData, PackManifest, PackManifestEntry, Recipe } from './types';
import { PackRuntime, wrapPackData } from './pack-runtime';
import { publicPath } from '@/lib/public-path';

export type PackLike = ActivePack | PackData;

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

export async function loadActivePack(entry: PackManifestEntry): Promise<ActivePack> {
  const res = await fetch(publicPath(entry.path));
  if (!res.ok) throw new Error(`Failed to load pack: ${entry.path}`);
  const header = (await res.json()) as PackData | { formatVersion: number };

  if (header.formatVersion === 2) {
    if (!entry.recipesRoot) {
      throw new Error(`Pack ${entry.modpackVersion} is v2 but manifest missing recipesRoot`);
    }
    return PackRuntime.fromManifestEntry(entry.path, entry.recipesRoot);
  }

  const pack = header as PackData;
  return wrapPackData(pack);
}

export function getItemName(
  pack: PackLike,
  itemId: string,
  lang: 'ru' | 'en',
): string {
  if ('getItemName' in pack && typeof pack.getItemName === 'function') {
    return pack.getItemName(itemId, lang);
  }
  const item = pack.items.find((i) => i.id === itemId);
  if (item) return item.names[lang] ?? item.names.en;
  const fluid = pack.fluids.find((f) => f.id === itemId);
  if (fluid) return fluid.names[lang] ?? fluid.names.en;
  return itemId;
}

export function getMachineName(
  pack: PackLike,
  machineId: string,
  lang: 'ru' | 'en',
): string {
  if ('getMachineName' in pack && typeof pack.getMachineName === 'function') {
    return pack.getMachineName(machineId, lang);
  }
  const m = pack.machines.find((x) => x.id === machineId);
  return m ? (m.names[lang] ?? m.names.en) : machineId;
}

export function getMachineRecipeCount(
  pack: PackLike,
  machineId: string,
): number {
  if ('getMachineRecipeCount' in pack && typeof pack.getMachineRecipeCount === 'function') {
    return pack.getMachineRecipeCount(machineId);
  }
  return (pack as PackData).recipes.filter((r) => r.machineId === machineId).length;
}

export function getRecipesForMachine(
  pack: PackLike,
  machineId: string,
): Recipe[] {
  if ('getCachedRecipesForMachine' in pack) {
    return pack.getCachedRecipesForMachine(machineId);
  }
  return (pack as PackData).recipes.filter((r) => r.machineId === machineId);
}

export function getRecipe(
  pack: PackLike,
  recipeId: string,
): Recipe | undefined {
  if ('getRecipe' in pack && typeof pack.getRecipe === 'function') {
    return pack.getRecipe(recipeId);
  }
  return (pack as PackData).recipes.find((r) => r.id === recipeId);
}

export function recipeCount(pack: PackLike): number {
  if ('recipeCount' in pack && typeof pack.recipeCount === 'function') {
    return pack.recipeCount();
  }
  return (pack as PackData).recipes.length;
}
