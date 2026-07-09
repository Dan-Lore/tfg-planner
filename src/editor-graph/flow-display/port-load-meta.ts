import type { FlowResult } from '@/calculator';
import { formatLoadPercent, formatRate, portInputDemandRate } from '@/calculator';
import { R } from '@/calculator';
import type { Recipe } from '@/data/types';
import { inputPortId } from '@/shared/ports';
import { primaryOutputIndex, primaryTheoreticalPortRate } from '@/shared/primary-output';
import type { SchemeNode } from '@/calculator';
import type { PortLoadMeta } from '@/editor-graph/port-display-types';
export type { PortLoadMeta };

export function fractionToPercent(fraction: ReturnType<typeof R.from>): number {
  return Math.min(100, Math.max(0, fraction.mul(R.from(100)).toNumber()));
}

export function buildInputPortLoadMeta(
  node: SchemeNode,
  recipe: Recipe | undefined,
  connectedIn: Set<string>,
  result: FlowResult,
  t: (key: string, opts?: Record<string, string>) => string,
): Record<string, PortLoadMeta> {
  const meta: Record<string, PortLoadMeta> = {};
  if (!recipe || recipe.inputs.length === 0) return meta;

  const theoreticalPrimary = primaryTheoreticalPortRate(
    node,
    recipe,
    result.nodePortOutputRates[node.id],
  );
  const primaryOutIdx = primaryOutputIndex(node, recipe);
  const portLoads = result.nodePortInLoad[node.id] ?? {};

  for (let i = 0; i < recipe.inputs.length; i++) {
    const portId = inputPortId(i);
    const demand = portInputDemandRate(recipe, i, theoreticalPrimary, primaryOutIdx);
    if (demand.compare(R.zero) <= 0) continue;

    const connected = connectedIn.has(portId);
    const loadFraction = connected
      ? (portLoads[portId] ?? R.zero)
      : R.zero;
    const loadPercent = fractionToPercent(loadFraction);
    const received = demand.mul(loadFraction);

    meta[portId] = {
      loadPercent,
      title: connected
        ? t('editor.portInputMaxLoadTitle', {
            load: formatLoadPercent(loadFraction),
            received: `${formatRate(received)}/s`,
            demand: `${formatRate(demand)}/s`,
          })
        : t('editor.portLoadOpenTitle', {
            load: formatLoadPercent(loadFraction),
            demand: `${formatRate(demand)}/s`,
          }),
    };
  }

  return meta;
}

export function buildOutputPortLoadMeta(
  nodeId: string,
  recipe: Recipe | undefined,
  connectedOut: Set<string>,
  result: FlowResult,
  t: (key: string, opts?: Record<string, string>) => string,
): Record<string, PortLoadMeta> {
  const meta: Record<string, PortLoadMeta> = {};
  if (!recipe || recipe.outputs.length === 0) return meta;

  const recipeLoads = result.nodePortOutRecipeLoad[nodeId] ?? {};
  const consumerLoads = result.nodePortOutConsumerLoad[nodeId] ?? {};
  const downstreamDemand = result.nodePortDownstreamDemand[nodeId] ?? {};
  const producedRates = result.nodePortOutputRates[nodeId] ?? {};

  for (let i = 0; i < recipe.outputs.length; i++) {
    const portId = `out_${i}`;
    const produced = producedRates[portId] ?? R.zero;
    const demand = downstreamDemand[portId] ?? R.zero;
    if (produced.compare(R.zero) <= 0 && demand.compare(R.zero) <= 0 && !connectedOut.has(portId)) {
      continue;
    }

    const connected = connectedOut.has(portId);
    const recipeLoadFraction = connected ? (recipeLoads[portId] ?? R.zero) : R.zero;
    const loadPercent = fractionToPercent(recipeLoadFraction);

    let sent = R.zero;
    if (connected && produced.compare(R.zero) > 0) {
      sent = produced.mul(recipeLoadFraction);
    } else if (connected && demand.compare(R.zero) > 0) {
      const consumerLoadFraction = consumerLoads[portId] ?? R.zero;
      sent = demand.mul(consumerLoadFraction);
    }

    let title: string;
    if (!connected) {
      title = t('editor.portOutLoadOpenTitle', {
        load: formatLoadPercent(recipeLoadFraction),
        produced: `${formatRate(produced)}/s`,
      });
    } else if (demand.compare(R.zero) > 0) {
      const consumerLoadFraction = consumerLoads[portId] ?? R.zero;
      title = t('editor.portOutConsumerDemandTitle', {
        load: formatLoadPercent(consumerLoadFraction),
        sent: `${formatRate(sent)}/s`,
        demand: `${formatRate(demand)}/s`,
      });
    } else {
      title = t('editor.portOutRecipeLoadTitle', {
        load: formatLoadPercent(recipeLoadFraction),
        sent: `${formatRate(sent)}/s`,
        produced: `${formatRate(produced)}/s`,
      });
    }

    meta[portId] = {
      loadPercent,
      title,
    };
  }

  return meta;
}
