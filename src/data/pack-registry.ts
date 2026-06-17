import type { PackData, PackManifest } from './types';
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

export function getRecipesForMachine(pack: PackData, machineId: string) {
  return pack.recipes.filter((r) => r.machineId === machineId);
}
