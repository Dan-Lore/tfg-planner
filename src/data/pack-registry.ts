import type { ActivePack } from './pack-runtime';
import type {
  PackData,
  PackManifest,
  PackManifestEntry,
  PackMeta,
  Recipe,
  RecipeShardIndex,
} from './types';
import { PackRuntime, wrapPackData } from './pack-runtime';
import { publicPath } from '@/lib/public-path';
import { packKey } from '@/lib/pack-key';
import type { PackBuildManifest } from '@/lib/pack-idb-cache';

export type PackLike = ActivePack | PackData;

const sessionCache = new Map<string, ActivePack>();

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  return res.json() as Promise<T>;
}

function indexUrl(recipesRoot: string): string {
  const root = recipesRoot.endsWith('/') ? recipesRoot : `${recipesRoot}/`;
  return `${root}index.json`;
}

function buildManifestUrl(modpackVersion: string): string {
  return publicPath(`/data/packs/${modpackVersion}/manifest.json`);
}

async function loadPackBuildManifest(modpackVersion: string): Promise<PackBuildManifest> {
  return fetchJson<PackBuildManifest>(buildManifestUrl(modpackVersion));
}

export function peekSessionCachedPack(entry: PackManifestEntry): ActivePack | null {
  return sessionCache.get(packKey(entry.modpackVersion, entry.dataVersion)) ?? null;
}

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

async function loadV2Pack(entry: PackManifestEntry): Promise<ActivePack> {
  if (!entry.recipesRoot) {
    throw new Error(`Pack ${entry.modpackVersion} is v2 but manifest missing recipesRoot`);
  }
  const recipesRoot = publicPath(entry.recipesRoot);
  const buildManifest = await loadPackBuildManifest(entry.modpackVersion);

  const meta = await fetchJson<PackMeta>(publicPath(entry.path));
  if (meta.formatVersion !== 2) {
    throw new Error(`Expected pack format v2 at ${entry.path}`);
  }
  if (
    meta.generatedAt !== buildManifest.generatedAt ||
    meta.modpackVersion !== buildManifest.modpackVersion ||
    meta.dataVersion !== buildManifest.dataVersion
  ) {
    throw new Error(
      `Pack ${entry.modpackVersion} build manifest mismatch (generatedAt or version)`,
    );
  }
  const shardIndex = await fetchJson<RecipeShardIndex>(publicPath(indexUrl(entry.recipesRoot)));

  return new PackRuntime(meta, recipesRoot, shardIndex);
}

export async function loadActivePack(entry: PackManifestEntry): Promise<ActivePack> {
  const key = packKey(entry.modpackVersion, entry.dataVersion);
  const cached = sessionCache.get(key);
  if (cached) {
    return cached;
  }

  const pack = entry.recipesRoot
    ? await loadV2Pack(entry)
    : wrapPackData(await fetchJson<PackData>(publicPath(entry.path)));

  sessionCache.set(key, pack);
  return pack;
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
