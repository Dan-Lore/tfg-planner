import type { PackData } from '@/data/types';

/** Inline copper line fixture (replaces deprecated 0.12.8-sample). */
export const minimalPack: PackData = {
  format: 'tfg-pack-data',
  formatVersion: 1,
  modpackVersion: 'test-minimal',
  dataVersion: 1,
  generatedAt: '2026-06-27T00:00:00Z',
  machines: [
    {
      id: 'gtceu:macerator',
      names: { ru: 'Дробитель', en: 'Macerator' },
      category: 'gt',
      recipeIds: ['gtceu:macerator/copper_ore'],
    },
    {
      id: 'gtceu:electric_furnace',
      names: { ru: 'Электропечь', en: 'Electric Furnace' },
      category: 'gt',
      recipeIds: ['gtceu:electric_furnace/copper_ingot'],
    },
  ],
  items: [
    { id: 'gtceu:copper_ore', names: { ru: 'Медная руда', en: 'Copper Ore' } },
    { id: 'gtceu:crushed_copper_ore', names: { ru: 'Дроб. медная руда', en: 'Crushed Copper Ore' } },
    { id: 'gtceu:copper_ingot', names: { ru: 'Медный слиток', en: 'Copper Ingot' } },
  ],
  fluids: [],
  recipes: [
    {
      id: 'gtceu:macerator/copper_ore',
      machineId: 'gtceu:macerator',
      durationTicks: 100,
      inputs: [{ itemId: 'gtceu:copper_ore', amount: 1 }],
      outputs: [{ itemId: 'gtceu:crushed_copper_ore', amount: 2 }],
      energy: { minVoltageTier: 'LV', voltage: 32, amperage: 1 },
    },
    {
      id: 'gtceu:electric_furnace/copper_ingot',
      machineId: 'gtceu:electric_furnace',
      durationTicks: 100,
      inputs: [{ itemId: 'gtceu:crushed_copper_ore', amount: 1 }],
      outputs: [{ itemId: 'gtceu:copper_ingot', amount: 1 }],
      energy: { minVoltageTier: 'LV', voltage: 32, amperage: 1 },
    },
  ],
};
