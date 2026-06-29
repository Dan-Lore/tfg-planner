import type { PackData } from '@/data/types';

export function emptyPackData(overrides: Partial<PackData> = {}): PackData {
  return {
    format: 'tfg-pack-data',
    formatVersion: 1,
    modpackVersion: 'test',
    dataVersion: 1,
    generatedAt: '',
    machines: [],
    items: [],
    fluids: [],
    recipes: [],
    ...overrides,
  };
}
