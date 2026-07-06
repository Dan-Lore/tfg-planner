import type { PackManifestEntry } from '@/data/types';
import type { TfgpFile } from '@/schema/tfgp';

export function isSchemeNonEmpty(scheme: TfgpFile): boolean {
  return scheme.nodes.length > 0 || scheme.edges.length > 0;
}

export function shouldWarnVersionMismatch(
  fileVersion: string,
  fileDataVersion: number,
  activeEntry: PackManifestEntry | null,
): boolean {
  if (!activeEntry) return false;
  return (
    activeEntry.modpackVersion !== fileVersion ||
    activeEntry.dataVersion !== fileDataVersion
  );
}
