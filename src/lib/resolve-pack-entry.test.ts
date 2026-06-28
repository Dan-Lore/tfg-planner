import { describe, expect, it } from 'vitest';
import type { PackManifestEntry } from '@/data/types';
import { packEntryNeedsLoad, resolvePackEntry } from './resolve-pack-entry';

const manifest: PackManifestEntry[] = [
  {
    modpackVersion: '0.12.8',
    dataVersion: 1,
    path: '/data/packs/0.12.8/pack.meta.json',
    recipesRoot: '/data/packs/0.12.8/recipes/',
    status: 'ready',
  },
];

describe('resolvePackEntry', () => {
  it('uses manifest entry when persisted path is stale', () => {
    const persisted: PackManifestEntry = {
      modpackVersion: '0.12.8',
      dataVersion: 1,
      path: '/data/packs/0.12.8/pack.json',
      status: 'ready',
    };
    const resolved = resolvePackEntry(persisted, manifest);
    expect(resolved?.path).toBe('/data/packs/0.12.8/pack.meta.json');
    expect(resolved?.recipesRoot).toBe('/data/packs/0.12.8/recipes/');
  });

  it('detects reload when recipesRoot missing in persisted entry', () => {
    const entry = manifest[0]!;
    const stale: PackManifestEntry = {
      modpackVersion: '0.12.8',
      dataVersion: 1,
      path: '/data/packs/0.12.8/pack.json',
      status: 'ready',
    };
    expect(packEntryNeedsLoad(entry, null, stale)).toBe(true);
    expect(packEntryNeedsLoad(entry, {} as never, entry)).toBe(false);
  });
});
