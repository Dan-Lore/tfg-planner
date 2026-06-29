import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const PACK_DIR = join(process.cwd(), 'public/data/packs/0.12.8');

describe('pack artifacts 0.12.8', () => {
  it('includes flow-index.json for port attach', () => {
    const path = join(PACK_DIR, 'recipes/flow-index.json');
    expect(existsSync(path)).toBe(true);
  });
});
