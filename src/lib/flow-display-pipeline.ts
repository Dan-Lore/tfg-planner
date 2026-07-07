import type { TFunction } from 'i18next';
import type { FlowResult } from '@/calculator/flow-solver';
import type { FlowEdgeData } from '@/lib/flow-edge-types';
import type { CycleSeedInfo } from '@/calculator/flow-solver-types';
import { formatRate } from '@/calculator/flow-solver';
import { R } from '@/calculator/rational';
import { buildEdgeFlowData } from '@/canvas/flow-display';
import type { ActivePack } from '@/data/pack-runtime';
import { getItemName } from '@/data/pack-registry';
import { formatCycleSeedBalanceLabel, formatCycleSeedTitle } from '@/lib/cycle-seed-label';
import type { TfgpFile } from '@/schema/tfgp-types';

export type FlowDisplayLocale = 'ru' | 'en';

function applyCycleSeedEdgeData(
  data: Record<string, FlowEdgeData>,
  seeds: readonly CycleSeedInfo[],
  pack: ActivePack,
  lang: FlowDisplayLocale,
  t: TFunction,
): void {
  for (const seed of seeds) {
    const productLabel = getItemName(pack, seed.productId, lang);
    const title = formatCycleSeedTitle(t, seed, productLabel);
    const existing = data[seed.edgeId] ?? {};
    const seedFlowLabel = formatRate(R.from(seed.seedFlowPerSecond));
    const balanceLabel = formatCycleSeedBalanceLabel(t, seed);
    data[seed.edgeId] = {
      ...existing,
      isCycleSeed: true,
      cycleSeedTitle: title,
      source: existing.source ?? seedFlowLabel,
      target: balanceLabel,
    };
  }
}

export function buildFlowDisplayPipeline(
  scheme: TfgpFile,
  pack: ActivePack,
  result: FlowResult,
  locale: FlowDisplayLocale,
  t: TFunction,
  nodeWidths: Record<string, number>,
): Record<string, FlowEdgeData> {
  const data = buildEdgeFlowData(
    scheme.edges,
    scheme.nodes,
    pack,
    result,
    nodeWidths,
  );
  applyCycleSeedEdgeData(data, result.cycleSeeds ?? [], pack, locale, t);
  return data;
}
