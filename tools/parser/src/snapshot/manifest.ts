import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

export const SNAPSHOT_SCHEMA_VERSION = 1;

export const REQUIRED_MARKER_RECIPE_IDS = [
  'gtceu:pyrolyse_oven/log_to_charcoal_byproducts',
  'gtceu:distill_charcoal_byproducts',
  'gtceu:distill_wood_tar',
] as const;

/** Alternate ids after TFG modifyRecipe renames or GT short ids. */
export const MARKER_RECIPE_ALIASES: Record<string, string[]> = {
  'gtceu:pyrolyse_oven/log_to_charcoal_byproducts': [
    'tfg:pyrolyse_oven/log_to_charcoal_byproducts',
  ],
  'gtceu:distill_charcoal_byproducts': [
    'gtceu:distillation_tower/distill_charcoal_byproducts',
    'tfg:distillation_tower/distill_charcoal_byproducts',
    'tfg:distill_charcoal_byproducts',
  ],
  'gtceu:distill_wood_tar': [
    'gtceu:distillation_tower/distill_wood_tar',
    'tfg:distillation_tower/distill_wood_tar',
    'tfg:distill_wood_tar',
  ],
};

export const MIN_RECIPE_COUNT_BY_TAG: Record<string, number> = {
  '0.12.8': 6000,
};

export interface SnapshotManifest {
  schemaVersion: number;
  modpackTag: string;
  pakkuLockSha256: string;
  recipeCount: number;
  exportedAt: string;
  markerRecipeIds: string[];
  snapshotSha256?: string;
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
  for (const alt of MARKER_RECIPE_ALIASES[marker] ?? []) {
    if (recipeIds.has(alt)) return true;
  }
  return false;
}

export function validateManifest(
  manifest: SnapshotManifest,
  recipeIds: Set<string>,
  tag: string,
): string[] {
  const errors: string[] = [];
  if (manifest.schemaVersion !== SNAPSHOT_SCHEMA_VERSION) {
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
  return errors;
}
