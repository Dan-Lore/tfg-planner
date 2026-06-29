import type { PackManifestEntry } from '@/data/types';
import { packKey } from '@/lib/pack-key';

export function entryPackKey(entry: PackManifestEntry): string {
  return packKey(entry.modpackVersion, entry.dataVersion);
}

/** Persisted pack selection matches editor scheme cache (same modpack + dataVersion). */
export function isEntryAlignedWithEditor(
  entry: PackManifestEntry | null | undefined,
  editorPackKey: string | null | undefined,
): boolean {
  if (!entry || !editorPackKey) return false;
  return entryPackKey(entry) === editorPackKey;
}
