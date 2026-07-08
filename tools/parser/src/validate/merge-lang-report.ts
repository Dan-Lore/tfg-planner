import type { BuildReport } from '../types.js';

/** Preserve lang metrics from an existing build-report when re-validating pack schema. */
export function mergeExistingLangReport(
  report: BuildReport,
  existing: BuildReport | null | undefined,
): BuildReport {
  if (!existing?.stats) return report;

  report.stats = {
    ...report.stats,
    recipeIoLocalized: existing.stats.recipeIoLocalized,
    recipeIoTagsLocalized: existing.stats.recipeIoTagsLocalized,
    recipeIoItemsLocalized: existing.stats.recipeIoItemsLocalized,
    recipeIoFluidsLocalized: existing.stats.recipeIoFluidsLocalized,
    recipeIoTotal: existing.stats.recipeIoTotal,
    recipeIoTagsTotal: existing.stats.recipeIoTagsTotal,
  };
  report.langCoverageByNamespace = existing.langCoverageByNamespace;
  report.langMissByReason = existing.langMissByReason;
  report.langMissSample = existing.langMissSample;
  report.langUnlocalizableSample = existing.langUnlocalizableSample;
  report.langAchievableCeiling = existing.langAchievableCeiling;
  return report;
}
