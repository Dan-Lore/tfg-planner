import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { canonicalPackMetaJson, checksumPackMeta } from './pack-checksum';
import type { PackMeta } from '@/data/types';

describe('pack checksum', () => {
  it('is stable for the same meta object', async () => {
    const metaPath = join(process.cwd(), 'public/data/packs/0.12.8/pack.meta.json');
    const meta = JSON.parse(readFileSync(metaPath, 'utf8')) as PackMeta;
    const a = await checksumPackMeta(meta);
    const b = await checksumPackMeta(JSON.parse(canonicalPackMetaJson(meta)) as PackMeta);
    if (a === null || b === null) {
      expect(globalThis.crypto?.subtle).toBeUndefined();
      return;
    }
    expect(a).toBe(b);
  });

  it('matches build manifest generatedAt', () => {
    const metaPath = join(process.cwd(), 'public/data/packs/0.12.8/pack.meta.json');
    const manifestPath = join(process.cwd(), 'public/data/packs/0.12.8/manifest.json');
    const meta = JSON.parse(readFileSync(metaPath, 'utf8')) as PackMeta;
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
      generatedAt: string;
      modpackVersion: string;
      dataVersion: number;
    };
    expect(meta.generatedAt).toBe(manifest.generatedAt);
    expect(meta.modpackVersion).toBe(manifest.modpackVersion);
    expect(meta.dataVersion).toBe(manifest.dataVersion);
  });
});
