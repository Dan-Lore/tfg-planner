import { describe, expect, it } from 'vitest';
import { buildTagIndexFromMeta } from '@/lib/tag-index';
import { productMatchesTag } from '@/lib/tag-rules';
import { flowsCompatible } from '@/lib/flow-match';

const metaFixture = {
  items: [
    { id: 'gtceu:copper_dust', names: { ru: 'x', en: 'x' } },
    { id: 'gtceu:copper_ingot', names: { ru: 'x', en: 'x' } },
    { id: 'gtceu:annealed_copper_dust', names: { ru: 'x', en: 'x' } },
    { id: 'tfc:wood/log/oak', names: { ru: 'x', en: 'x' } },
    { id: '#forge:dusts/copper', names: { ru: 'x', en: 'x' } },
    { id: '#forge:ingots/copper', names: { ru: 'x', en: 'x' } },
    { id: '#forge:air', names: { ru: 'x', en: 'x' } },
    { id: '#minecraft:logs_that_burn', names: { ru: 'x', en: 'x' } },
  ],
  fluids: [{ id: 'gtceu:air', names: { ru: 'Земной воздух', en: 'Earth Air' } }],
};

describe('tag-rules', () => {
  it('matches forge category/material dusts and ingots', () => {
    expect(productMatchesTag('#forge:dusts/copper', 'gtceu:copper_dust')).toBe(true);
    expect(productMatchesTag('#forge:ingots/copper', 'gtceu:copper_ingot')).toBe(true);
    expect(productMatchesTag('#forge:dusts/copper', 'gtceu:annealed_copper_dust')).toBe(false);
    expect(productMatchesTag('#forge:dusts/annealed_copper', 'gtceu:annealed_copper_dust')).toBe(
      true,
    );
  });

  it('matches forge simple fluid tags', () => {
    expect(productMatchesTag('#forge:air', 'gtceu:air')).toBe(true);
  });

  it('matches mod namespace and plural tags', () => {
    expect(productMatchesTag('#ad_astra:aeronos_caps', 'ad_astra:aeronos_cap')).toBe(true);
    expect(productMatchesTag('#create:tracks', 'create:track')).toBe(true);
    expect(productMatchesTag('#ae2:interface', 'ae2:interface')).toBe(true);
  });

  it('matches compound forge category tags', () => {
    expect(productMatchesTag('#forge:axe_heads/bronze', 'gtceu:bronze_axe_head')).toBe(true);
    expect(productMatchesTag('#forge:belt_connectors/rubber', 'gtceu:rubber_belt_connector')).toBe(
      true,
    );
  });

  it('matches mod tag suffix groups', () => {
    expect(productMatchesTag('#ae2:covered_cable', 'ae2:white_covered_cable')).toBe(true);
  });

  it('matches minecraft log tags', () => {
    expect(productMatchesTag('#minecraft:logs_that_burn', 'tfc:wood/log/oak')).toBe(true);
  });
});

describe('buildTagIndexFromMeta', () => {
  const tags = buildTagIndexFromMeta(metaFixture);

  it('indexes air separation chain', () => {
    expect(tags.members.get('#forge:air')?.has('gtceu:air')).toBe(true);
    expect(
      flowsCompatible(
        { fluidId: 'gtceu:air', amount: 10_000 },
        { fluidId: '#forge:air', amount: 10_000 },
        tags,
      ),
    ).toBe(true);
  });

  it('indexes copper dust and ingot tags', () => {
    expect(tags.members.get('#forge:dusts/copper')?.has('gtceu:copper_dust')).toBe(true);
    expect(tags.members.get('#forge:ingots/copper')?.has('gtceu:copper_ingot')).toBe(true);
  });
});
