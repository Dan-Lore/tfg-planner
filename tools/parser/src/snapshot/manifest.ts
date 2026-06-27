import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

export const SNAPSHOT_SCHEMA_VERSION = 2;

/** Marker recipes that must exist in a complete TFG 0.12.8 export. */
export const REQUIRED_MARKER_RECIPE_IDS = [
  'tfg:tfc_wood_sapling_pine/1',
  'tfg:raw_aromatic_mix_charcoal_hydrogen',
  'tfg:aromatic_feedstock@lcr',
  'tfg:reformed_aromatic_feedstock@lcr',
  'tfg:reformate_gas_cracker',
  'gtceu:pyrolyse_oven/log_to_charcoal_byproducts',
  'gtceu:distillation_tower/distill_wood_tar',
] as const;

/** Alternate ids: RecipeManager codec uses tfg:{machine}/{path}; schemes use short KubeJS ids. */
export const RECIPE_SCHEME_ALIASES: Record<string, string[]> = {
  'gtceu:pyrolyse_oven/log_to_charcoal_byproducts': [
    'tfg:pyrolyse_oven/log_to_charcoal_byproducts',
  ],
  'gtceu:distillation_tower/distill_wood_tar': [
    'gtceu:distill_wood_tar',
    'tfg:distillation_tower/distill_wood_tar',
    'tfg:distill_wood_tar',
  ],
  'tfg:tfc_wood_sapling_pine/1': ['tfg:greenhouse/8x_tfc_wood_sapling_pine/1'],
  'tfg:raw_aromatic_mix_charcoal_hydrogen': [
    'tfg:coal_liquefaction_tower/raw_aromatic_mix_charcoal_hydrogen',
  ],
  'tfg:aromatic_feedstock@lcr': ['tfg:large_chemical_reactor/aromatic_feedstock'],
  'tfg:aromatic_feedstock': ['tfg:chemical_reactor/aromatic_feedstock'],
  'tfg:reformed_aromatic_feedstock@lcr': [
    'tfg:large_chemical_reactor/reformed_aromatic_feedstock',
  ],
  'tfg:reformed_aromatic_feedstock': ['tfg:chemical_reactor/reformed_aromatic_feedstock'],
  'tfg:reformate_gas_cracker': ['tfg:cracker/reformate_gas_cracker'],
  'tfg:electrolyze_syngas@lcr': ['tfg:large_chemical_reactor/electrolyze_syngas'],
  'tfg:methanol_distil_propylene': ['tfg:distillation_tower/methanol_distil_propylene'],
  'tfg:pyrolyse_oven/log_to_wood_tar_nitrogen': [
    'tfg:pyrolyse_oven/gtceu_pyrolyse_oven_log_to_wood_tar_nitrogen',
  ],
  'tfg:pyrolyse_oven/log_to_creosote_nitrogen': [
    'tfg:pyrolyse_oven/gtceu_pyrolyse_oven_log_to_creosote_nitrogen',
  ],
  'gtceu:distill_wood_tar': ['gtceu:distillation_tower/distill_wood_tar'],
  'gtceu:centrifuge/uranium_238_separation': ['tfg:centrifuge/uranium_238_separation'],
  'gtceu:compressor/snowballs_to_snow': [
    'gtceu:compressor/compressor/snowballs_to_snow_fixed',
  ],
  'gtceu:distill_charcoal_byproducts': ['gtceu:distillation_tower/distill_charcoal_byproducts'],
  'tfg:raw_aromatic_mix_charcoal': ['tfg:coal_liquefaction_tower/raw_aromatic_mix_charcoal'],
  'tfg:cracker_off_gas_recycling': ['tfg:electrolyzer/cracker_off_gas_recycling'],
};

/** @deprecated use RECIPE_SCHEME_ALIASES */
export const MARKER_RECIPE_ALIASES = RECIPE_SCHEME_ALIASES;

export const MIN_RECIPE_COUNT_BY_TAG: Record<string, number> = {
  '0.12.8': 40_000,
};

export const MIN_TYPE_COUNTS_BY_TAG: Record<string, Record<string, number>> = {
  '0.12.8': {
    'gtceu:greenhouse': 1000,
    'gtceu:coal_liquefaction_tower': 10,
  },
};

export const MIN_TFG_RECIPE_COUNT_BY_TAG: Record<string, number> = {
  '0.12.8': 3000,
};

export interface SerializeStats {
  primary: number;
  fallback: number;
  dropped: number;
}

export interface SnapshotManifest {
  schemaVersion: number;
  modpackTag: string;
  pakkuLockSha256: string;
  recipeCount: number;
  exportedAt: string;
  markerRecipeIds: string[];
  snapshotSha256?: string;
  typeCounts?: Record<string, number>;
  serializeStats?: SerializeStats;
  source?: string;
}

export function sha256File(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

export function sha256Text(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

export function defaultSnapshotDir(parserRoot: string, tag: string): string {
  return join(parserRoot, 'snapshots', tag);
}

export function readSnapshotManifest(snapshotDir: string): SnapshotManifest | null {
  const path = join(snapshotDir, 'snapshot-manifest.json');
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf-8')) as SnapshotManifest;
}

export function markerPresent(recipeIds: Set<string>, marker: string): boolean {
  if (recipeIds.has(marker)) return true;
  for (const alt of RECIPE_SCHEME_ALIASES[marker] ?? []) {
    if (recipeIds.has(alt)) return true;
  }
  return false;
}

export function countRecipesByType(recipes: readonly { id: string }[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const recipe of recipes) {
    const prefix = recipe.id.startsWith('tfg:')
      ? 'tfg'
      : recipe.id.includes('/')
        ? recipe.id.slice(0, recipe.id.indexOf('/'))
        : recipe.id.split(':')[0] ?? 'unknown';
    counts[prefix] = (counts[prefix] ?? 0) + 1;
  }
  return counts;
}

export function validateManifest(
  manifest: SnapshotManifest,
  recipeIds: Set<string>,
  tag: string,
  recipes?: readonly { id: string; machineId?: string }[],
): string[] {
  const errors: string[] = [];
  if (manifest.schemaVersion !== SNAPSHOT_SCHEMA_VERSION && manifest.schemaVersion !== 1) {
    errors.push(`Unsupported snapshot schemaVersion ${manifest.schemaVersion}`);
  }
  if (manifest.modpackTag !== tag) {
    errors.push(`Snapshot tag ${manifest.modpackTag} != build tag ${tag}`);
  }
  const minCount = MIN_RECIPE_COUNT_BY_TAG[tag] ?? 5000;
  if (manifest.recipeCount < minCount) {
    errors.push(`Snapshot recipeCount ${manifest.recipeCount} < ${minCount}`);
  }
  for (const marker of REQUIRED_MARKER_RECIPE_IDS) {
    if (!markerPresent(recipeIds, marker)) {
      errors.push(`Missing marker recipe: ${marker}`);
    }
  }

  const minTypes = MIN_TYPE_COUNTS_BY_TAG[tag];
  if (minTypes && recipes) {
    const machineCounts = new Map<string, number>();
    for (const r of recipes) {
      if (!r.machineId) continue;
      machineCounts.set(r.machineId, (machineCounts.get(r.machineId) ?? 0) + 1);
    }
    for (const [machineId, min] of Object.entries(minTypes)) {
      const actual = machineCounts.get(machineId) ?? 0;
      if (actual < min) {
        errors.push(`Machine ${machineId} has ${actual} recipes (need >= ${min})`);
      }
    }
  } else if (minTypes && manifest.typeCounts) {
    for (const [type, min] of Object.entries(minTypes)) {
      const actual = manifest.typeCounts[type] ?? 0;
      if (actual < min) {
        errors.push(`Recipe type ${type} count ${actual} < ${min} in manifest`);
      }
    }
  }

  const minTfg = MIN_TFG_RECIPE_COUNT_BY_TAG[tag];
  if (minTfg != null) {
    let tfgCount = 0;
    for (const id of recipeIds) {
      if (id.startsWith('tfg:')) tfgCount++;
    }
    if (tfgCount < minTfg) {
      errors.push(`tfg: recipe count ${tfgCount} < ${minTfg}`);
    }
  }

  if (manifest.serializeStats && manifest.serializeStats.dropped > 100) {
    errors.push(
      `Snapshot serialize dropped ${manifest.serializeStats.dropped} recipes (>100)`,
    );
  }

  return errors;
}
