import { describe, it, expect } from 'vitest';
import type { PackData, Recipe } from '@/data/types';
import {
  buildRecipeIngredientSearchText,
  filterItemsByQuery,
  getPrefixAutocompleteSuffix,
  splitMachineDisplay,
  normalizeSearchQuery,
  resolveMachineId,
  resolveMachineDisplayLabel,
  findActiveItemIndex,
} from './search-combobox';

const machineItems = [
  { id: 'a', label: 'Экстрактор', searchText: 'Экстрактор' },
  { id: 'b', label: 'Экструдер', searchText: 'Экструдер' },
  { id: 'c', label: 'Автоклав', searchText: 'Автоклав' },
];

describe('search-combobox', () => {
  it('normalizes query', () => {
    expect(normalizeSearchQuery('  Экст ')).toBe('экст');
    expect(normalizeSearchQuery('бревна')).toBe('бревна');
    expect(normalizeSearchQuery('брёвна')).toBe('бревна');
  });

  it('returns all items for empty query', () => {
    expect(filterItemsByQuery(machineItems, '')).toHaveLength(3);
    expect(filterItemsByQuery(machineItems, '   ')).toHaveLength(3);
  });

  it('filters machines by substring', () => {
    const filtered = filterItemsByQuery(machineItems, 'экст');
    expect(filtered.map((i) => i.id)).toEqual(['a', 'b']);
  });

  it('splits machine display for idle and prefix completion', () => {
    expect(splitMachineDisplay('', 'Экстрактор')).toEqual({
      typed: '',
      suffix: 'Экстрактор',
    });
    expect(splitMachineDisplay('Экс', 'Экстрактор')).toEqual({
      typed: 'Экс',
      suffix: 'трактор',
    });
  });

  it('builds prefix autocomplete suffix', () => {
    expect(getPrefixAutocompleteSuffix('Экст', 'Экстрактор')).toBe('рактор');
    expect(getPrefixAutocompleteSuffix('авто', 'Автоклав')).toBe('клав');
    expect(getPrefixAutocompleteSuffix('клав', 'Автоклав')).toBe('');
  });

  it('finds active machine index in filtered list', () => {
    const all = [
      { id: 'auto', label: 'Автоклав', searchText: 'Автоклав' },
      { id: 'bio', label: 'Биореактор', searchText: 'Биореактор' },
      { id: 'ext', label: 'Экстрактор', searchText: 'Экстрактор' },
    ];
    const filtered = filterItemsByQuery(all, '');
    expect(findActiveItemIndex(filtered, 'bio', '')).toBe(1);
    expect(findActiveItemIndex(filtered, null, 'ext')).toBe(2);
  });

  it('uses explicit machine label when query empty', () => {
    const all = [
      { id: 'auto', label: 'Автоклав', searchText: 'Автоклав' },
      { id: 'bio', label: 'Биореактор', searchText: 'Биореактор' },
    ];
    const filtered = filterItemsByQuery(all, '');
    expect(resolveMachineDisplayLabel(all, filtered, '', 'bio')).toBe('Биореактор');
    expect(resolveMachineDisplayLabel(all, filtered, 'авто', 'bio')).toBe('Автоклав');
  });

  it('resolves machine id with explicit pick or first', () => {
    const filtered = filterItemsByQuery(machineItems, 'экст');
    expect(resolveMachineId('b', filtered)).toBe('b');
    expect(resolveMachineId(null, filtered)).toBe('a');
    expect(resolveMachineId('missing', filtered)).toBe('a');
    expect(resolveMachineId(null, [])).toBeNull();
  });

  it('matches recipe by ingredient not label', () => {
    const recipe: Recipe = {
      id: 'test:mix',
      machineId: 'gtceu:mixer',
      inputs: [{ itemId: 'minecraft:copper_ingot', amount: 1 }],
      outputs: [{ itemId: 'gtceu:copper_dust', amount: 1 }],
      durationTicks: 20,
    };
    const pack: PackData = {
      format: 'tfg-pack-data',
      formatVersion: 1,
      modpackVersion: 'test',
      dataVersion: 1,
      generatedAt: '',
      machines: [],
      recipes: [recipe],
      items: [
        {
          id: 'minecraft:copper_ingot',
          names: { ru: 'Медный слиток', en: 'Copper ingot' },
        },
        {
          id: 'gtceu:copper_dust',
          names: { ru: 'Медная пыль', en: 'Copper dust' },
        },
      ],
      fluids: [],
    };
    const searchText = buildRecipeIngredientSearchText(pack, recipe, 'ru');
    expect(searchText).toContain('Медный слиток');
    expect(searchText).toContain('Медная пыль');
    const items = [
      {
        id: recipe.id,
        label: '1× Медный слиток → 1× Медная пыль',
        searchText,
      },
    ];
    expect(filterItemsByQuery(items, 'слиток')).toHaveLength(1);
    expect(filterItemsByQuery(items, 'миксер')).toHaveLength(0);
  });

  it('finds pyrolyse log recipe by бревна without ё and by уголь', () => {
    const recipe: Recipe = {
      id: 'tfg:pyrolyse_oven/log_to_creosote',
      machineId: 'gtceu:pyrolyse_oven',
      inputs: [{ itemId: '#minecraft:logs_that_burn', amount: 16 }],
      outputs: [
        { itemId: 'minecraft:charcoal', amount: 20 },
        { fluidId: 'gtceu:creosote', amount: 4000 },
      ],
      durationTicks: 1280,
    };
    const pack: PackData = {
      format: 'tfg-pack-data',
      formatVersion: 1,
      modpackVersion: 'test',
      dataVersion: 1,
      generatedAt: '',
      machines: [],
      recipes: [recipe],
      items: [
        {
          id: '#minecraft:logs_that_burn',
          names: { ru: 'Горящие брёвна', en: 'Burnable Logs' },
        },
        {
          id: 'minecraft:charcoal',
          names: { ru: 'Древесный уголь', en: 'Charcoal' },
        },
      ],
      fluids: [
        {
          id: 'gtceu:creosote',
          names: { ru: 'Креозот', en: 'Creosote' },
        },
      ],
    };
    const items = [
      {
        id: recipe.id,
        label: '16× Горящие брёвна → 20× Древесный уголь, 4000× Креозот',
        searchText: buildRecipeIngredientSearchText(pack, recipe, 'ru'),
      },
    ];
    expect(filterItemsByQuery(items, 'бревна')).toHaveLength(1);
    expect(filterItemsByQuery(items, 'уголь')).toHaveLength(1);
    expect(filterItemsByQuery(items, 'creosote')).toHaveLength(1);
  });
});
