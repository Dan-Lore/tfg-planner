import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildTagIndexFromMeta } from '@/lib/tag-index';
import { productMatchesTag } from '@/lib/tag-rules';

describe('tag index on pack 0.12.8', () => {
  it('builds quickly with broad coverage', () => {
    const meta = JSON.parse(
      readFileSync('public/data/packs/0.12.8/pack.meta.json', 'utf8'),
    );
    const t0 = performance.now();
    const idx = buildTagIndexFromMeta(meta);
    const buildMs = performance.now() - t0;

    const tagIds = [...meta.fluids, ...meta.items]
      .filter((d: { id: string }) => d.id.startsWith('#'))
      .map((d: { id: string }) => d.id);

    let empty = 0;
    for (const t of tagIds) {
      if ((idx.members.get(t)?.size ?? 0) === 0) empty++;
    }

    expect(buildMs).toBeLessThan(30_000);
    expect(idx.members.get('#forge:air')?.has('gtceu:air')).toBe(true);
    expect(productMatchesTag('#ad_astra:aeronos_caps', 'ad_astra:aeronos_cap')).toBe(true);
    expect(idx.members.get('#forge:axe_heads/bronze')?.has('gtceu:bronze_axe_head')).toBe(true);
    expect(empty / tagIds.length).toBeLessThan(0.25);

    // eslint-disable-next-line no-console
    console.log({
      buildMs: Math.round(buildMs),
      tags: tagIds.length,
      empty,
      coverage: `${Math.round((1 - empty / tagIds.length) * 100)}%`,
    });
  });
});
