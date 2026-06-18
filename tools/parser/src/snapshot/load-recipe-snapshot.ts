import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { RecipeOp, ParseWarning } from '../types.js';
import {
  readSnapshotManifest,
  validateManifest,
  sha256File,
  type SnapshotManifest,
} from './manifest.js';
import { recipeFromSnapshotJson, recipeIdFromDumpPath } from './recipe-json.js';

export interface SnapshotLoadStats {
  files: number;
  parsed: number;
  skipped: number;
  skipReasons: Record<string, number>;
}

export interface SnapshotLoadResult {
  recipes: RecipeOp[];
  manifest: SnapshotManifest | null;
  stats: SnapshotLoadStats;
  warnings: ParseWarning[];
  manifestOk: boolean;
  snapshotSha256?: string;
}

export interface LoadRecipeSnapshotOptions {
  snapshotDir: string;
  modpackTag: string;
  strict?: boolean;
}

function bumpSkip(stats: SnapshotLoadStats, reason: string): void {
  stats.skipped++;
  stats.skipReasons[reason] = (stats.skipReasons[reason] ?? 0) + 1;
}

function loadRecipesArray(
  snapshotDir: string,
  stats: SnapshotLoadStats,
  warnings: ParseWarning[],
): RecipeOp[] {
  const path = join(snapshotDir, 'recipes.json');
  if (!existsSync(path)) return [];

  stats.files = 1;
  const raw = JSON.parse(readFileSync(path, 'utf-8')) as unknown;
  const entries = Array.isArray(raw) ? raw : (raw as { recipes?: unknown[] }).recipes;
  if (!Array.isArray(entries)) {
    warnings.push({ file: path, reason: 'recipes.json is not an array', kind: 'substrate' });
    return [];
  }

  const recipes: RecipeOp[] = [];
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') {
      bumpSkip(stats, 'malformed_json');
      continue;
    }
    const e = entry as { id?: string };
    const id = e.id ?? 'unknown';
    const { recipe, skipReason } = recipeFromSnapshotJson(
      id,
      entry as Record<string, unknown>,
      `snapshot:${path}`,
    );
    if (recipe) {
      recipes.push(recipe);
      stats.parsed++;
    } else {
      bumpSkip(stats, skipReason ?? 'empty_io');
    }
  }
  return recipes;
}

function walkGtJsonDump(
  snapshotDir: string,
  stats: SnapshotLoadStats,
  warnings: ParseWarning[],
): RecipeOp[] {
  const recipes: RecipeOp[] = [];

  function walk(dir: string): void {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      const st = statSync(full);
      if (st.isDirectory()) {
        if (name === 'gt-recipes') {
          walk(full);
        } else if (name !== 'node_modules') {
          walk(full);
        }
        continue;
      }
      if (!name.endsWith('.json')) continue;
      if (name === 'snapshot-manifest.json' || name === 'recipes.json') continue;

      stats.files++;
      try {
        const rel = relative(snapshotDir, full).replace(/\\/g, '/');
        const raw = JSON.parse(readFileSync(full, 'utf-8')) as Record<string, unknown>;
        if (raw.type && typeof raw.type === 'string') {
          const id = recipeIdFromDumpPath(rel);
          const { recipe, skipReason } = recipeFromSnapshotJson(id, raw, `snapshot:${rel}`);
          if (recipe) {
            recipes.push(recipe);
            stats.parsed++;
          } else {
            bumpSkip(stats, skipReason ?? 'empty_io');
          }
          continue;
        }
        for (const [key, val] of Object.entries(raw)) {
          if (!val || typeof val !== 'object') continue;
          const id = key.includes(':') ? key : recipeIdFromDumpPath(`${rel.replace(/\.json$/, '')}/${key}`);
          const { recipe, skipReason } = recipeFromSnapshotJson(
            id,
            val as Record<string, unknown>,
            `snapshot:${rel}`,
          );
          if (recipe) {
            recipes.push(recipe);
            stats.parsed++;
          } else {
            bumpSkip(stats, skipReason ?? 'empty_io');
          }
        }
      } catch {
        bumpSkip(stats, 'malformed_json');
        warnings.push({ file: full, reason: 'Failed to parse snapshot JSON', kind: 'substrate' });
      }
    }
  }

  walk(snapshotDir);
  return recipes;
}

export function loadRecipeSnapshot(options: LoadRecipeSnapshotOptions): SnapshotLoadResult {
  const { snapshotDir, modpackTag, strict } = options;
  const warnings: ParseWarning[] = [];
  const stats: SnapshotLoadStats = {
    files: 0,
    parsed: 0,
    skipped: 0,
    skipReasons: {},
  };

  if (!existsSync(snapshotDir)) {
    const msg = `Recipe snapshot missing: ${snapshotDir}`;
    warnings.push({ file: snapshotDir, reason: msg, kind: 'substrate' });
    if (strict) throw new Error(msg);
    return { recipes: [], manifest: null, stats, warnings, manifestOk: false };
  }

  let recipes = loadRecipesArray(snapshotDir, stats, warnings);
  if (recipes.length === 0) {
    recipes = walkGtJsonDump(snapshotDir, stats, warnings);
  }

  const manifest = readSnapshotManifest(snapshotDir);
  let snapshotSha256: string | undefined;
  const recipesPath = join(snapshotDir, 'recipes.json');
  if (existsSync(recipesPath)) {
    snapshotSha256 = sha256File(recipesPath);
  }

  const recipeIds = new Set(recipes.map((r) => r.id));
  let manifestOk = false;
  if (manifest) {
    const errors = validateManifest(manifest, recipeIds, modpackTag);
    manifestOk = errors.length === 0;
    for (const err of errors) {
      warnings.push({ file: 'snapshot-manifest.json', reason: err, kind: 'substrate' });
    }
  } else {
    warnings.push({
      file: join(snapshotDir, 'snapshot-manifest.json'),
      reason: 'Missing snapshot-manifest.json',
      kind: 'substrate',
    });
  }

  if (strict && (!manifestOk || recipes.length === 0)) {
    throw new Error(
      `Snapshot validation failed for ${modpackTag}: ${warnings.map((w) => w.reason).join('; ')}`,
    );
  }

  return { recipes, manifest, stats, warnings, manifestOk, snapshotSha256 };
}
