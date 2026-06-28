import type { PackManifestEntry } from '@/data/types';
import type { ActivePack } from '@/data/pack-runtime';

/** Map persisted selection onto current manifest (path/recipesRoot may have changed). */
export function resolvePackEntry(
  persisted: PackManifestEntry | null | undefined,
  manifest: PackManifestEntry[],
): PackManifestEntry | null {
  if (manifest.length === 0) return null;
  if (persisted) {
    const match = manifest.find(
      (e) =>
        e.modpackVersion === persisted.modpackVersion &&
        e.status !== 'deprecated',
    );
    if (match) return match;
  }
  return manifest.find((e) => e.status === 'ready') ?? manifest[0] ?? null;
}

export function packEntryNeedsLoad(
  entry: PackManifestEntry,
  activePack: ActivePack | null,
  activeEntry: PackManifestEntry | null,
): boolean {
  if (!activePack) return true;
  if (!activeEntry) return true;
  if (activeEntry.modpackVersion !== entry.modpackVersion) return true;
  if (activeEntry.path !== entry.path) return true;
  if (activeEntry.recipesRoot !== entry.recipesRoot) return true;
  return false;
}
