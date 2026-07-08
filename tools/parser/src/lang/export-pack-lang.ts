import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import type { PackData, Recipe } from '../../../../src/data/types.js';
import {
  buildResolvedMap,
  collectResolveKeysForIds,
  pruneLangBundle,
  type LangBundle,
  type PackLangArtifact,
} from '../../../../src/lib/product-lexicon/index.js';
import { buildTagIndexForRecipes, buildTagIndexFromMeta } from '../../../../src/lib/tag-index.js';

export interface ExportPackLangResult {
  artifact: PackLangArtifact;
  gzipBytes: Buffer;
  sha256: string;
}

function collectRecipeIoIds(recipes: Recipe[]): Set<string> {
  const ids = new Set<string>();
  for (const recipe of recipes) {
    for (const flow of [...recipe.inputs, ...recipe.outputs]) {
      const id = flow.itemId ?? flow.fluidId;
      if (id) ids.add(id);
    }
  }
  return ids;
}

export function exportPackLang(
  pack: PackData,
  langBundle: LangBundle,
): ExportPackLangResult {
  const productIds = collectRecipeIoIds(pack.recipes);
  for (const def of [...pack.items, ...pack.fluids]) productIds.add(def.id);

  const tagIndex = buildTagIndexForRecipes(
    { items: pack.items, fluids: pack.fluids },
    pack.recipes,
    buildTagIndexFromMeta({ items: pack.items, fluids: pack.fluids }),
  );
  const bakedNames = new Map<string, { ru: string; en: string }>();
  for (const def of [...pack.items, ...pack.fluids]) {
    bakedNames.set(def.id, def.names);
  }
  const resolved = buildResolvedMap(productIds, langBundle, tagIndex, bakedNames);
  const resolveKeys = collectResolveKeysForIds(productIds, langBundle);
  const pruned = pruneLangBundle(langBundle, productIds, resolveKeys);

  const artifact: PackLangArtifact = {
    format: 'tfg-pack-lang',
    formatVersion: 1,
    modpackVersion: pack.modpackVersion,
    dataVersion: pack.dataVersion,
    generatedAt: pack.generatedAt,
    bundle: pruned,
    resolved,
  };

  const json = JSON.stringify(artifact);
  const gzipBytes = gzipSync(Buffer.from(json, 'utf8'));
  const sha256 = createHash('sha256').update(gzipBytes).digest('hex');

  return { artifact, gzipBytes, sha256 };
}
