import type { TFunction } from 'i18next';
import type { FlowResult } from '@/calculator/flow-solver';
import {
  buildPortDisplays,
  type PortDisplay,
} from '@/canvas/MachineNode';
import type { PackLike } from '@/data/pack-registry';
import { getRecipe } from '@/data/pack-registry';
import { flowLabel } from '@/canvas/ports';
import {
  buildInputPortLoadMeta,
  buildNodeBalanceLines,
  buildOutputPortLoadMeta,
  rateMapToStrings,
  type NodeBalanceLine,
} from '@/canvas/flow-display';
import type { TfgpEdge, TfgpMachineNode } from '@/schema/tfgp-types';
import { mergedNodePortIds } from '@/lib/scheme-port-ids';
import { normalizePortId } from '@/lib/ports';

function stubLabelFromEdges(
  nodeId: string,
  portId: string,
  edges: readonly TfgpEdge[],
  pack: PackLike,
  lang: 'ru' | 'en',
  direction: 'in' | 'out',
): string {
  for (const edge of edges) {
    const isMatch =
      direction === 'in'
        ? edge.target === nodeId && normalizePortId(edge.targetPort) === portId
        : edge.source === nodeId && normalizePortId(edge.sourcePort) === portId;
    if (!isMatch) continue;
    const productId = edge.itemId ?? edge.fluidId;
    if (!productId) continue;
    return flowLabel(
      { itemId: edge.itemId, fluidId: edge.fluidId, amount: 1 },
      pack,
      lang,
    );
  }
  return portId;
}

function stubPortsFromIds(
  portIds: string[],
  edges: readonly TfgpEdge[],
  nodeId: string,
  pack: PackLike,
  lang: 'ru' | 'en',
  connected: Set<string>,
  direction: 'in' | 'out',
): PortDisplay[] {
  return portIds.map((portId) => ({
    portId,
    label: stubLabelFromEdges(nodeId, portId, edges, pack, lang, direction),
    connected: connected.has(portId),
  }));
}

export interface MachinePortDisplayBundle {
  inputPorts: PortDisplay[];
  outputPorts: PortDisplay[];
  balanceLines: NodeBalanceLine[];
}

/** Port labels for layout/display before or without flow rates. */
export function buildMachinePortDisplaysForNode(
  node: TfgpMachineNode,
  edges: readonly TfgpEdge[],
  pack: PackLike,
  lang: 'ru' | 'en',
  connectedIn: Set<string>,
  connectedOut: Set<string>,
  flowResult?: FlowResult,
  t?: TFunction,
): MachinePortDisplayBundle {
  const recipe = getRecipe(pack, node.recipeId);
  const { inputPortIds, outputPortIds } = mergedNodePortIds(
    node.id,
    edges,
    recipe?.inputs.length ?? 0,
    recipe?.outputs.length ?? 0,
  );

  if (flowResult && t) {
    const inputRates = rateMapToStrings(flowResult.nodeInputRates[node.id]);
    const outputRates = rateMapToStrings(flowResult.nodeOutputRates[node.id]);
    const outputPortRateRationals = flowResult.nodePortOutputRates[node.id];
    const inputPortLoadMeta = buildInputPortLoadMeta(
      node,
      recipe,
      connectedIn,
      flowResult,
      t,
    );
    const outputPortLoadMeta = buildOutputPortLoadMeta(
      node.id,
      recipe,
      connectedOut,
      flowResult,
      t,
    );
    const { inputPorts, outputPorts } = buildPortDisplays(
      recipe,
      pack,
      lang,
      connectedIn,
      connectedOut,
      inputRates,
      outputRates,
      outputPortRateRationals,
      inputPortLoadMeta,
      outputPortLoadMeta,
    );
    return {
      inputPorts,
      outputPorts,
      balanceLines: buildNodeBalanceLines(
        node.id,
        recipe,
        connectedIn,
        flowResult,
        pack,
        lang,
      ),
    };
  }

  if (recipe) {
    const { inputPorts, outputPorts } = buildPortDisplays(
      recipe,
      pack,
      lang,
      connectedIn,
      connectedOut,
      {},
      {},
    );
    return { inputPorts, outputPorts, balanceLines: [] };
  }

  return {
    inputPorts: stubPortsFromIds(
      inputPortIds,
      edges,
      node.id,
      pack,
      lang,
      connectedIn,
      'in',
    ),
    outputPorts: stubPortsFromIds(
      outputPortIds,
      edges,
      node.id,
      pack,
      lang,
      connectedOut,
      'out',
    ),
    balanceLines: [],
  };
}

/** Layout sig fragment for one node (rates + labels). */
export function machineNodeLayoutSigFragment(
  node: TfgpMachineNode,
  edges: readonly TfgpEdge[],
  pack: PackLike,
  lang: 'ru' | 'en',
  connectedIn: Set<string>,
  connectedOut: Set<string>,
  flowResult?: FlowResult,
  t?: TFunction,
): string {
  const recipeReady = getRecipe(pack, node.recipeId) ? '1' : '0';
  const bundle = buildMachinePortDisplaysForNode(
    node,
    edges,
    pack,
    lang,
    connectedIn,
    connectedOut,
    flowResult,
    t,
  );
  const portLabels = [...bundle.inputPorts, ...bundle.outputPorts]
    .map((p) => `${p.portId}:${p.label}:${p.rate ?? ''}`)
    .join(',');
  const balance = bundle.balanceLines.map((l) => l.text).join('|');
  return [
    node.id,
    node.recipeId,
    node.machineCount,
    node.overclock,
    node.parallel,
    node.voltageTier,
    recipeReady,
    portLabels,
    balance,
  ].join('\0');
}
