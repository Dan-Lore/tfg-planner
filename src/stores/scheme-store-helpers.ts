import type { TfgpFile } from '@/schema/tfgp';
import { cacheScheme } from '@/stores/editor-store-shared';

export interface SchemeCacheSlice {
  scheme: TfgpFile;
  activePackKey: string | null;
  schemesByPack: Record<string, TfgpFile>;
}

/** Apply a scheme patch and sync schemesByPack cache. */
export function patchSchemeCache(
  slice: SchemeCacheSlice,
  nextScheme: TfgpFile,
): Pick<SchemeCacheSlice, 'scheme' | 'schemesByPack'> {
  return {
    scheme: nextScheme,
    schemesByPack: cacheScheme(slice.schemesByPack, slice.activePackKey, nextScheme),
  };
}

export function patchSchemeFields(
  slice: SchemeCacheSlice,
  patch: Partial<TfgpFile>,
): Pick<SchemeCacheSlice, 'scheme' | 'schemesByPack'> {
  return patchSchemeCache(slice, { ...slice.scheme, ...patch });
}
