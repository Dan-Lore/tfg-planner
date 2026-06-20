import type { PackData } from '../../../../src/data/types.js';
import type { BuildReport, ParseWarning, WarningKind } from '../types.js';

export function summarizeWarningsByKind(
  warnings: ParseWarning[],
): Partial<Record<WarningKind, number>> {
  const out: Partial<Record<WarningKind, number>> = {};
  for (const w of warnings) {
    let kind: WarningKind = w.kind ?? 'other';
    if (!w.kind) {
      if (w.reason.includes('.forEach')) kind = 'forEach';
      else if (w.reason.includes('findRecipes')) kind = 'findRecipes';
      else if (w.reason.includes('modifyResult')) kind = 'modifyResult';
      else if (w.reason.includes('modifyRecipe')) kind = 'modifyRecipe';
      else if (w.file.includes('substrate')) kind = 'substrate';
    }
    out[kind] = (out[kind] ?? 0) + 1;
  }
  return out;
}

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
      snapshotRecipes: extra.snapshotRecipes ?? pack.recipes.length,
      snapshotFiles: extra.snapshotFiles ?? 0,
      snapshotParsed: extra.snapshotParsed ?? pack.recipes.length,
      snapshotSkipped: extra.snapshotSkipped ?? 0,
      snapshotSha256: extra.snapshotSha256,
      finalRecipes: pack.recipes.length,
      machines: pack.machines.length,
      items: pack.items.length,
      fluids: pack.fluids.length,
      recipesWithEnergy: pack.recipes.filter((r) => r.energy != null).length,
      recipesWithChance: pack.recipes.filter((r) =>
        [...r.inputs, ...r.outputs].some(
          (f) => f.chance !== undefined && f.chance > 0 && f.chance < 10_000,
        ),
      ).length,
      goldenMatched: extra.goldenMatched,
      goldenMismatched: extra.goldenMismatched,
      goldenMissing: extra.goldenMissing,
    },
    warnings,
    warningsByKind: summarizeWarningsByKind(warnings),
    unparsedFiles,
  };
}
