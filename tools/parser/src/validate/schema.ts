import type { PackData } from '../../../../src/data/types.js';
import type { BuildReport } from '../types.js';

export function validatePackSchema(pack: PackData): string[] {
  const errors: string[] = [];
  if (pack.format !== 'tfg-pack-data') errors.push('Invalid format');
  if (pack.formatVersion !== 1) errors.push('Unsupported formatVersion');
  if (!pack.modpackVersion) errors.push('Missing modpackVersion');
  if (!Array.isArray(pack.recipes)) errors.push('Missing recipes array');

  const recipeIds = new Set<string>();
  for (const r of pack.recipes) {
    if (!r.id) errors.push('Recipe missing id');
    else if (recipeIds.has(r.id)) errors.push(`Duplicate recipe id: ${r.id}`);
    else recipeIds.add(r.id);
    if (!r.machineId) errors.push(`Recipe ${r.id} missing machineId`);
    if (r.durationTicks <= 0) errors.push(`Recipe ${r.id} invalid duration`);
  }
  return errors;
}

export function buildReportFromPack(
  pack: PackData,
  tag: string,
  extra: Partial<BuildReport['stats']> = {},
  warnings: BuildReport['warnings'] = [],
  unparsedFiles: string[] = [],
): BuildReport {
  return {
    modpackVersion: pack.modpackVersion,
    tag,
    generatedAt: new Date().toISOString(),
    stats: {
      substrateRecipes: extra.substrateRecipes ?? 0,
      datapackRecipes: extra.datapackRecipes ?? 0,
      kubejsRecipes: extra.kubejsRecipes ?? 0,
      removes: extra.removes ?? 0,
      replaces: extra.replaces ?? 0,
      finalRecipes: pack.recipes.length,
      machines: pack.machines.length,
      items: pack.items.length,
      fluids: pack.fluids.length,
      recipesWithEnergy: pack.recipes.filter((r) => r.energy != null).length,
      filesScanned: extra.filesScanned ?? 0,
      filesUnparsed: extra.filesUnparsed ?? unparsedFiles.length,
      goldenMatched: extra.goldenMatched,
      goldenMismatched: extra.goldenMismatched,
      goldenMissing: extra.goldenMissing,
    },
    warnings,
    unparsedFiles,
  };
}
