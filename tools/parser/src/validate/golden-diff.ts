import { readFileSync, existsSync } from 'node:fs';
import type { PackData, Recipe, RecipeEnergy } from '../../../../src/data/types.js';

export interface GoldenRecipe {
  id: string;
  machineId?: string;
  durationTicks?: number;
  /** Legacy: compared against voltage × amperage. */
  euPerTick?: number;
  energy?: RecipeEnergy;
  inputs?: { itemId?: string; fluidId?: string; amount: number }[];
  outputs?: { itemId?: string; fluidId?: string; amount: number }[];
}

export interface GoldenFile {
  modpackVersion: string;
  recipes: GoldenRecipe[];
}

export interface GoldenDiffResult {
  matched: number;
  mismatched: number;
  missing: number;
  diffs: { id: string; field: string; expected: unknown; actual: unknown }[];
}

function recipeById(pack: PackData): Map<string, Recipe> {
  return new Map(pack.recipes.map((r) => [r.id, r]));
}

export function loadGolden(path: string): GoldenFile | null {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf-8')) as GoldenFile;
}

export function diffAgainstGolden(pack: PackData, golden: GoldenFile): GoldenDiffResult {
  const map = recipeById(pack);
  const diffs: GoldenDiffResult['diffs'] = [];
  let matched = 0;
  let mismatched = 0;
  let missing = 0;

  for (const g of golden.recipes) {
    const actual = map.get(g.id);
    if (!actual) {
      missing++;
      diffs.push({ id: g.id, field: 'presence', expected: 'present', actual: 'missing' });
      continue;
    }

    let ok = true;
    if (g.machineId && actual.machineId !== g.machineId) {
      ok = false;
      diffs.push({ id: g.id, field: 'machineId', expected: g.machineId, actual: actual.machineId });
    }
    if (g.durationTicks !== undefined && actual.durationTicks !== g.durationTicks) {
      ok = false;
      diffs.push({
        id: g.id,
        field: 'durationTicks',
        expected: g.durationTicks,
        actual: actual.durationTicks,
      });
    }
    if (g.energy) {
      const actualEnergy = actual.energy;
      if (!actualEnergy) {
        ok = false;
        diffs.push({ id: g.id, field: 'energy', expected: g.energy, actual: undefined });
      } else {
        for (const key of ['minVoltageTier', 'voltage', 'amperage'] as const) {
          if (g.energy[key] !== actualEnergy[key]) {
            ok = false;
            diffs.push({
              id: g.id,
              field: `energy.${key}`,
              expected: g.energy[key],
              actual: actualEnergy[key],
            });
          }
        }
      }
    } else if (g.euPerTick !== undefined) {
      const eu = actual.energy
        ? actual.energy.voltage * actual.energy.amperage
        : undefined;
      if (eu !== g.euPerTick) {
        ok = false;
        diffs.push({ id: g.id, field: 'euPerTick', expected: g.euPerTick, actual: eu });
      }
    }
    if (ok) matched++;
    else mismatched++;
  }

  return { matched, mismatched, missing, diffs };
}
