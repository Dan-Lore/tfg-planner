import { describe, it, expect } from 'vitest';
import {
  resolveResourceName,
  resolveMachineName,
  type LangBundle,
} from '@/shared/product-lexicon';
import { buildTagIndexFromMeta } from '@/shared/tag-index';
import type { PackMeta } from '@/data/types';

describe('product lexicon', () => {
  it('resolves GTCEu prefix dust sizes and gems', () => {
    const bundle: LangBundle = {
      ru: {
        'material.gtceu.rhenium': 'Рений',
        'material.gtceu.amethyst': 'Аметист',
        'material.gtceu.magnesium_diboride': 'Диборид магния',
        'tagprefix.tiny_dust': '%s (Крохотная кучка пыли)',
        'tagprefix.pure_dust': '%s (Чистая кучка пыли)',
        'tagprefix.chipped_gem': '%s (Осколок)',
        'tagprefix.hot_ingot': '%s (Горячий слиток)',
      },
      en: {
        'material.gtceu.rhenium': 'Rhenium',
        'material.gtceu.amethyst': 'Amethyst',
        'material.gtceu.magnesium_diboride': 'Magnesium Diboride',
        'tagprefix.tiny_dust': 'Tiny Pile of %s Dust',
        'tagprefix.pure_dust': 'Pure Pile of %s Dust',
        'tagprefix.chipped_gem': '%s Gem Chip',
        'tagprefix.hot_ingot': 'Hot %s Ingot',
      },
    };
    expect(resolveResourceName('gtceu:tiny_rhenium_dust', bundle).ru).toBe(
      'Рений (Крохотная кучка пыли)',
    );
    expect(resolveResourceName('gtceu:pure_amethyst_dust', bundle).ru).toBe(
      'Аметист (Чистая кучка пыли)',
    );
    expect(resolveResourceName('gtceu:chipped_amethyst_gem', bundle).ru).toBe('Аметист (Осколок)');
    expect(resolveResourceName('gtceu:hot_magnesium_diboride_ingot', bundle).ru).toBe(
      'Диборид магния (Горячий слиток)',
    );
  });

  it('resolves forge category/material tags', () => {
    const bundle: LangBundle = {
      ru: {
        'tag.item.forge.dusts': 'Пыль %s',
        'material.gtceu.copper': 'меди',
      },
      en: {
        'tag.item.forge.dusts': '%s Dust',
        'material.gtceu.copper': 'Copper',
      },
    };
    expect(resolveResourceName('#forge:dusts/copper', bundle).ru).toBe('Пыль меди');
  });

  it('resolves tag via member fallback', () => {
    const bundle: LangBundle = {
      ru: { 'fluid.gtceu.sulfuric_acid': 'Серная кислота' },
      en: { 'fluid.gtceu.sulfuric_acid': 'Sulfuric Acid' },
    };
    const meta = {
      items: [],
      fluids: [
        { id: '#forge:sulfuric_acid', names: { ru: 'forge:sulfuric acid', en: 'forge:sulfuric acid' } },
        { id: 'gtceu:sulfuric_acid', names: { ru: 'Серная кислота', en: 'Sulfuric Acid' } },
      ],
    } satisfies Pick<PackMeta, 'items' | 'fluids'>;
    const tagIndex = buildTagIndexFromMeta(meta);
    expect(
      resolveResourceName('#forge:sulfuric_acid', bundle, { tagIndex }).ru,
    ).toBe('Серная кислота');
  });

  it('resolves GTCEu cables via suffix aliases', () => {
    const bundle: LangBundle = {
      ru: {
        'tagprefix.cable_gt_quadruple': '4х кабель (%s)',
        'material.gtceu.aluminium': 'Алюминий',
      },
      en: {
        'tagprefix.cable_gt_quadruple': '4x %s Cable',
        'material.gtceu.aluminium': 'Aluminium',
      },
    };
    expect(resolveResourceName('gtceu:aluminium_quadruple_cable', bundle).ru).toBe(
      '4х кабель (Алюминий)',
    );
  });

  it('falls back tag to item lang key', () => {
    const bundle: LangBundle = {
      ru: { 'item.ae2.fluix_glass_cable': 'Кабель из флюиксового стекла' },
      en: { 'item.ae2.fluix_glass_cable': 'Fluix Glass Cable' },
    };
    expect(resolveResourceName('#ae2:fluix_glass_cable', bundle).ru).toBe(
      'Кабель из флюиксового стекла',
    );
  });

  it('resolves forge sheets and small_gears category tags', () => {
    const bundle: LangBundle = {
      ru: {
        'tag.item.forge.sheet': 'Лист %s',
        'tag.item.forge.small_gear': 'Малая шестерня %s',
        'material.gtceu.copper': 'меди',
        'material.gtceu.steel': 'стали',
      },
      en: {
        'tag.item.forge.sheet': '%s Sheet',
        'tag.item.forge.small_gear': 'Small %s Gear',
        'material.gtceu.copper': 'Copper',
        'material.gtceu.steel': 'Steel',
      },
    };
    expect(resolveResourceName('#forge:sheets/copper', bundle).ru).toBe('Лист меди');
    expect(resolveResourceName('#forge:small_gears/steel', bundle).ru).toBe('Малая шестерня стали');
  });

  it('resolves machine names', () => {
    const bundle: LangBundle = {
      ru: { 'emi.category.minecraft.smelting': 'Плавка' },
      en: { 'emi.category.minecraft.smelting': 'Smelting' },
    };
    expect(resolveMachineName('minecraft:smelting', bundle).ru).toBe('Плавка');
  });
});
