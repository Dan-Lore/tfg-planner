import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { PackMeta, Recipe } from '@/data/types';
import { buildRecipeFlowAttachIndex } from '@/lib/recipe-flow-attach-index';
import { buildTagIndexForRecipes, buildTagIndexFromMeta } from '@/lib/tag-index';
import { recipePathSuffix, normalizeRecipeCanon } from '@/lib/recipe-canon';

const PACK_DIR = join(process.cwd(), 'public/data/packs/0.12.8');
const RECIPES_DIR = join(PACK_DIR, 'recipes');
const REWRITE = process.argv.includes('--rewrite');

function shardFileName(machineId: string): string {
  return `${machineId.replace(/[:/\\]/g, '__')}.json`;
}

function loadAllRecipes(): Recipe[] {
  const recipes: Recipe[] = [];
  for (const file of readdirSync(RECIPES_DIR)) {
    if (!file.endsWith('.json') || file === 'index.json' || file === 'flow-index.json') {
      continue;
    }
    recipes.push(...(JSON.parse(readFileSync(join(RECIPES_DIR, file), 'utf8')) as Recipe[]));
  }
  return recipes;
}

describe('recanonicalize pack 0.12.8', () => {
  it(
    REWRITE ? 'rewrites shards without duplicate LCR variants' : 'reports duplicate LCR variants to remove',
    () => {
    const before = loadAllRecipes();
    const { recipes, removedIds } = normalizeRecipeCanon(before);

    const lcrDupes = recipes.filter(
      (r) =>
        r.machineId === 'gtceu:large_chemical_reactor' &&
        r.id.endsWith('@lcr') &&
        recipes.some(
          (o) =>
            o.machineId === 'gtceu:large_chemical_reactor' &&
            recipePathSuffix(o.id) === recipePathSuffix(r.id) &&
            !o.id.endsWith('@lcr'),
        ),
    );
    expect(lcrDupes).toHaveLength(0);

    if (!REWRITE) {
      expect(removedIds).toHaveLength(0);
      expect(recipes.length).toBe(before.length);
      return;
    }

    const byMachine = new Map<string, Recipe[]>();
    for (const recipe of recipes) {
      const list = byMachine.get(recipe.machineId) ?? [];
      list.push(recipe);
      byMachine.set(recipe.machineId, list);
    }

    const shardIndex: Record<string, { file: string; count: number }> = {};
    for (const [machineId, list] of byMachine) {
      const file = shardFileName(machineId);
      writeFileSync(join(RECIPES_DIR, file), JSON.stringify(list));
      shardIndex[machineId] = { file, count: list.length };
    }

    writeFileSync(
      join(RECIPES_DIR, 'index.json'),
      JSON.stringify({
        format: 'tfg-pack-recipe-index',
        formatVersion: 1,
        shards: shardIndex,
      }),
    );

    const meta = JSON.parse(readFileSync(join(PACK_DIR, 'pack.meta.json'), 'utf8')) as PackMeta;
    for (const machine of meta.machines) {
      machine.recipeIds = (byMachine.get(machine.id) ?? []).map((r) => r.id);
    }
    writeFileSync(join(PACK_DIR, 'pack.meta.json'), JSON.stringify(meta));

    const tags = buildTagIndexForRecipes(meta, recipes, buildTagIndexFromMeta(meta));
    writeFileSync(
      join(RECIPES_DIR, 'flow-index.json'),
      JSON.stringify(buildRecipeFlowAttachIndex(recipes, tags)),
    );

    const reportPath = join(PACK_DIR, 'build-report.json');
    try {
      const report = JSON.parse(readFileSync(reportPath, 'utf8')) as {
        stats?: Record<string, unknown>;
        removedDuplicateRecipeIdsSample?: string[];
      };
      report.stats = {
        ...report.stats,
        finalRecipes: recipes.length,
        removedDuplicateRecipes: removedIds.length,
      };
      report.removedDuplicateRecipeIdsSample = removedIds.slice(0, 50);
      writeFileSync(reportPath, JSON.stringify(report, null, 2));
    } catch {
      mkdirSync(PACK_DIR, { recursive: true });
    }

    // eslint-disable-next-line no-console
    console.log({
      before: before.length,
      after: recipes.length,
      removed: removedIds.length,
    });
  },
    REWRITE ? 120_000 : 30_000,
  );
});
