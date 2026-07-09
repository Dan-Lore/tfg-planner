import type { FlowResult } from '@/calculator';
import { formatLoadPercent } from '@/calculator';
import { R, type Rational } from '@/calculator';
import type { Recipe } from '@/data/types';
import { fractionToPercent } from '@/editor-graph/flow-display/port-load-meta';

export interface NodeLoadMeta {
  maxLoadPercent: number;
  currentLoadPercent: number;
  maxLabel: string;
  currentLabel: string;
  maxTitle: string;
  currentTitle: string;
  /** @deprecated Use currentLoadPercent */
  loadPercent: number;
  /** @deprecated Use currentLabel */
  label: string;
  /** @deprecated Use currentTitle */
  title: string;
}

/** Min recipe load on connected outputs — actual throughput vs full recipe rate. */
export function computeNodeRecipeThroughput(
  nodeId: string,
  result: FlowResult,
): Rational | undefined {
  const loads = result.nodePortOutRecipeLoad[nodeId];
  if (!loads) return undefined;
  const values = Object.values(loads);
  if (values.length === 0) return undefined;
  let min = R.from(1);
  for (const load of values) {
    if (load.compare(min) < 0) min = load;
  }
  return min;
}

export function buildNodeLoadMeta(
  nodeId: string,
  recipe: Recipe | undefined,
  result: FlowResult,
  t: (key: string, opts?: Record<string, string>) => string,
): NodeLoadMeta | undefined {
  const maxFraction = result.nodeMaxLoad[nodeId];
  const capacityFraction =
    result.nodeCurrentLoad[nodeId] ?? result.nodeLoad[nodeId];
  const throughputFraction =
    computeNodeRecipeThroughput(nodeId, result) ??
    capacityFraction ??
    maxFraction;
  if (maxFraction === undefined && throughputFraction === undefined) return undefined;

  const maxLoadPercent = fractionToPercent(maxFraction ?? R.from(1));
  const currentLoadPercent = fractionToPercent(throughputFraction ?? R.from(1));
  const maxStr = formatLoadPercent(maxFraction ?? R.from(1));
  const currentStr = formatLoadPercent(throughputFraction ?? R.from(1));
  const capacityStr =
    capacityFraction != null ? formatLoadPercent(capacityFraction) : undefined;
  const combinedLabel = t('editor.loadUtilizationMeta', {
    current: currentStr,
    max: maxStr,
  });
  const combinedTitle = [
    t('editor.recipeThroughputTitle', { load: currentStr }),
    t('editor.maxLoadTitle', { load: maxStr }),
    capacityStr != null
      ? t('editor.currentLoadTitle', { load: capacityStr })
      : null,
  ]
    .filter(Boolean)
    .join('\n');

  if (!recipe || recipe.inputs.length === 0) {
    return {
      maxLoadPercent,
      currentLoadPercent,
      maxLabel: t('editor.maxLoadMeta', { value: maxStr }),
      currentLabel: t('editor.currentLoadMeta', { value: currentStr }),
      maxTitle: t('editor.maxLoadTitle', { load: maxStr }),
      currentTitle: t('editor.nodeOutputLoadTitle', { load: currentStr }),
      loadPercent: currentLoadPercent,
      label: combinedLabel,
      title: combinedTitle,
    };
  }

  return {
    maxLoadPercent,
    currentLoadPercent,
    maxLabel: t('editor.maxLoadMeta', { value: maxStr }),
    currentLabel: t('editor.currentLoadMeta', { value: currentStr }),
    maxTitle: t('editor.maxLoadTitle', { load: maxStr }),
    currentTitle: t('editor.currentLoadTitle', { load: currentStr }),
    loadPercent: currentLoadPercent,
    label: combinedLabel,
    title: combinedTitle,
  };
}
