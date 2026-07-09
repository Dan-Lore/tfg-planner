import type { FlowResult } from '@/calculator';
import { formatRate } from '@/calculator';
import { R } from '@/calculator';
import type { PackLike } from '@/data/pack-registry';
import type { Recipe } from '@/data/types';
import { getItemName } from '@/data/pack-registry';
import { inputPortId } from '@/shared/ports';
import type { NodeBalanceLine } from '@/editor-graph/port-display-types';
export type { NodeBalanceLine };

export function buildNodeBalanceLines(
  nodeId: string,
  recipe: Recipe | undefined,
  _connectedInPorts: Set<string>,
  result: FlowResult,
  pack: PackLike,
  lang: 'ru' | 'en',
): NodeBalanceLine[] {
  const lines: NodeBalanceLine[] = [];
  if (!recipe) return lines;

  const portDeficit = result.nodePortDeficit[nodeId];
  if (portDeficit) {
    for (let i = 0; i < recipe.inputs.length; i++) {
      const portId = inputPortId(i);
      const deficit = portDeficit[portId];
      if (!deficit || deficit.compare(R.zero) <= 0) continue;
      const inp = recipe.inputs[i]!;
      const name = getItemName(pack, inp.itemId ?? inp.fluidId ?? '?', lang);
      lines.push({ kind: 'in', text: `-${formatRate(deficit)}/s ${name}` });
    }
  }

  const surplus = result.nodeSurplus[nodeId];
  if (surplus) {
    for (const [key, rate] of Object.entries(surplus)) {
      const resourceId = key.replace(/^(item|fluid):/, '');
      const name = getItemName(pack, resourceId, lang);
      lines.push({ kind: 'out', text: `+${formatRate(rate)}/s ${name}` });
    }
  }

  return lines;
}

export function rateMapToStrings(
  rates: Record<string, import('@/calculator').Rational> | undefined,
): Record<string, string> {
  if (!rates) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(rates)) {
    if (v.toNumber() > 0) out[k] = `${formatRate(v)}/s`;
  }
  return out;
}
