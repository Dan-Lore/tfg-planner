import type { FlowResult } from '@/calculator/flow-solver';
import { formatRate } from '@/calculator/flow-solver';
import type { FlowEdgeData } from '@/canvas/FlowEdge';
import type { PackData } from '@/data/types';
import { getItemName } from '@/data/pack-registry';
import type { TfgpEdge } from '@/schema/tfgp';
export function buildEdgeFlowData(
  edges: TfgpEdge[],
  result: FlowResult,
): Record<string, FlowEdgeData> {
  const data: Record<string, FlowEdgeData> = {};
  for (const edge of edges) {
    const src = result.edgeFlows[edge.id];
    const tgt = result.edgeTargetFlows[edge.id];
    if (!src) continue;
    const srcText = `${formatRate(src)}/s`;
    const tgtText = tgt ? `${formatRate(tgt)}/s` : srcText;
    if (tgt && src.compare(tgt) === 0) {
      data[edge.id] = { unified: srcText };
    } else {
      data[edge.id] = { source: srcText, target: tgtText };
    }
  }
  return data;
}

export function buildNodeSurplusLines(
  nodeId: string,
  result: FlowResult,
  pack: PackData,
  lang: 'ru' | 'en',
): string[] {
  const surplus = result.nodeSurplus[nodeId];
  if (!surplus) return [];
  return Object.entries(surplus).map(([key, rate]) => {
    const resourceId = key.replace(/^(item|fluid):/, '');
    const name = getItemName(pack, resourceId, lang);
    return `+${formatRate(rate)}/s ${name}`;
  });
}
export function rateMapToStrings(
  rates: Record<string, import('@/calculator/rational').Rational> | undefined,
): Record<string, string> {
  if (!rates) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(rates)) {
    if (v.toNumber() > 0) out[k] = `${formatRate(v)}/s`;
  }
  return out;
}
