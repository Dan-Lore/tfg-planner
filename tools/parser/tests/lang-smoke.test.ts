import { readFileSync, existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { isFallbackName } from '../../../src/lib/product-lexicon/lang-keys.js';
import type { PackLangArtifact } from '../../../src/lib/product-lexicon/types.js';

const root = join(import.meta.dirname, '..', '..', '..');
const tag = '0.12.8';
const packDir = join(root, 'public/data/packs', tag);

function loadLangArtifact(): PackLangArtifact | null {
  const path = join(packDir, 'pack.lang.json.gz');
  if (!existsSync(path)) return null;
  return JSON.parse(gunzipSync(readFileSync(path)).toString()) as PackLangArtifact;
}

describe('lang smoke tags (K-025)', () => {
  const artifact = loadLangArtifact();

  it.skipIf(!artifact)('resolves smoke tags to human-readable RU names', () => {
    const resolved = artifact!.resolved ?? {};
    const smokeIds = [
      '#forge:sulfuric_acid',
      '#forge:purified_ores/chalcopyrite',
      '#gtceu:circuits/mv',
      '#gtceu:batteries/lv',
    ];
    for (const id of smokeIds) {
      const names = resolved[id];
      expect(names, `missing resolved entry for ${id}`).toBeDefined();
      expect(isFallbackName(id, names!), `${id} still fallback: ${names!.ru}`).toBe(false);
      expect(names!.ru.length).toBeGreaterThan(3);
    }
  });
});
