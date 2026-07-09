import type { FlowResult } from '@/calculator';
import { formatLoadPercent, formatRate, portInputDemandRate } from '@/calculator';
import { R, type Rational } from '@/calculator';
import type { PackLike } from '@/data/pack-registry';
import type { Recipe } from '@/data/types';
import { getItemName } from '@/data/pack-registry';
import { parsePortId, productKey } from '@/shared/ports';
import { primaryOutputIndex, primaryTheoreticalPortRate } from '@/shared/primary-output';
import type { SchemeNode } from '@/calculator';
import { computeNodeRecipeThroughput } from '@/editor-graph/flow-display/node-load-meta';

const BOTTLENECK_LOAD_EPS = 0.005;
const BOTTLENECK_FULL_LOAD = 0.995;

export interface NodeBottleneckMeta {
  kind: 'input' | 'output';
  portId: string;
  productId: string;
  shortLabel: string;
  title: string;
}

function findLimitingPortLoad(
  loads: Record<string, Rational> | undefined,
  connected: Set<string>,
  portCount: number,
  prefix: 'in' | 'out',
): { portId: string; load: Rational } | undefined {
  let bestPort: string | undefined;
  let bestLoad = R.from(1);
  for (let i = 0; i < portCount; i++) {
    const portId = `${prefix}_${i}`;
    if (!connected.has(portId)) continue;
    const load = loads?.[portId] ?? R.zero;
    if (load.compare(bestLoad) < 0) {
      bestLoad = load;
      bestPort = portId;
    }
  }
  return bestPort ? { portId: bestPort, load: bestLoad } : undefined;
}

function findOutputBackpressurePort(
  nodeId: string,
  recipe: Recipe,
  connectedOut: Set<string>,
  result: FlowResult,
): { portId: string; load: Rational } | undefined {
  const recipeLoads = result.nodePortOutRecipeLoad[nodeId];
  const consumerLoads = result.nodePortOutConsumerLoad[nodeId];
  if (!recipeLoads) return undefined;

  let minRecipeLoad = R.from(1);
  for (let i = 0; i < recipe.outputs.length; i++) {
    const portId = `out_${i}`;
    if (!connectedOut.has(portId)) continue;
    const load = recipeLoads[portId] ?? R.from(1);
    if (load.compare(minRecipeLoad) < 0) minRecipeLoad = load;
  }

  const full = R.from(BOTTLENECK_FULL_LOAD);
  const eps = R.from(BOTTLENECK_LOAD_EPS);
  let best: { portId: string; load: Rational } | undefined;

  for (let i = 0; i < recipe.outputs.length; i++) {
    const portId = `out_${i}`;
    if (!connectedOut.has(portId)) continue;
    const recipeLoad = recipeLoads[portId];
    if (!recipeLoad || recipeLoad.compare(minRecipeLoad.add(eps)) > 0) continue;

    const consumerLoad = consumerLoads?.[portId];
    if (consumerLoad === undefined) continue;
    if (consumerLoad.compare(full) < 0) continue;

    if (!best || recipeLoad.compare(best.load) < 0) {
      best = { portId, load: recipeLoad };
    }
  }

  return best;
}

/** Short hint why recipe throughput is below 100% — input starved or output backpressure. */
export function buildNodeBottleneckMeta(
  node: SchemeNode,
  recipe: Recipe | undefined,
  connectedIn: Set<string>,
  connectedOut: Set<string>,
  result: FlowResult,
  pack: PackLike,
  lang: 'ru' | 'en',
  t: (key: string, opts?: Record<string, string>) => string,
): NodeBottleneckMeta | undefined {
  if (!recipe) return undefined;

  const throughput = computeNodeRecipeThroughput(node.id, result) ?? R.from(1);
  if (throughput.compare(R.from(BOTTLENECK_FULL_LOAD)) >= 0) return undefined;

  const maxLoad = result.nodeMaxLoad[node.id] ?? R.from(1);
  const eps = R.from(BOTTLENECK_LOAD_EPS);
  const full = R.from(BOTTLENECK_FULL_LOAD);

  const inputStarved =
    maxLoad.compare(full) < 0 && maxLoad.compare(throughput.add(eps)) <= 0;

  const primaryOutIdx = primaryOutputIndex(node, recipe);
  const theoreticalPrimary = primaryTheoreticalPortRate(
    node,
    recipe,
    result.nodePortOutputRates[node.id],
  );

  if (inputStarved) {
    const limiting = findLimitingPortLoad(
      result.nodePortInLoad[node.id],
      connectedIn,
      recipe.inputs.length,
      'in',
    );
    if (!limiting) return undefined;
    const parsedIn = parsePortId(limiting.portId);
    if (!parsedIn || parsedIn.kind !== 'in') return undefined;
    const inp = recipe.inputs[parsedIn.index];
    if (!inp) return undefined;
    const productId = productKey(inp);
    const product = getItemName(pack, productId, lang);
    const demand = portInputDemandRate(recipe, parsedIn.index, theoreticalPrimary, primaryOutIdx);
    const received = demand.mul(limiting.load);
    return {
      kind: 'input',
      portId: limiting.portId,
      productId,
      shortLabel: t('editor.bottleneck.inputShort', { product }),
      title: t('editor.bottleneck.inputTitle', {
        portId: limiting.portId,
        product,
        received: `${formatRate(received)}/s`,
        demand: `${formatRate(demand)}/s`,
        load: formatLoadPercent(limiting.load),
      }),
    };
  }

  const limiting = findOutputBackpressurePort(node.id, recipe, connectedOut, result);
  if (!limiting) return undefined;
  const parsedOut = parsePortId(limiting.portId);
  if (!parsedOut || parsedOut.kind !== 'out') return undefined;
  const out = recipe.outputs[parsedOut.index];
  if (!out) return undefined;
  const productId = productKey(out);
  const product = getItemName(pack, productId, lang);
  const produced = result.nodePortOutputRates[node.id]?.[limiting.portId] ?? R.zero;
  const sent = produced.mul(limiting.load);
  return {
    kind: 'output',
    portId: limiting.portId,
    productId,
    shortLabel: t('editor.bottleneck.outputShort', { product }),
    title: t('editor.bottleneck.outputTitle', {
      portId: limiting.portId,
      product,
      sent: `${formatRate(sent)}/s`,
      produced: `${formatRate(produced)}/s`,
      load: formatLoadPercent(limiting.load),
    }),
  };
}
