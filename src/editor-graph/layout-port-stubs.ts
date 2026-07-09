import type { TFunction } from 'i18next';
import type { FlowResult } from '@/calculator';
import { customMachineAsRecipe } from '@/calculator';
import type { SchemeNode } from '@/calculator';
import {
  buildInputPortLoadMeta,
  buildNodeBalanceLines,
  buildOutputPortLoadMeta,
  rateMapToStrings,
} from '@/editor-graph/flow-node-load';
import type { PackLike } from '@/data/pack-registry';
import { getRecipe } from '@/data/pack-registry';
import { applyCustomPortLabels } from '@/editor-graph/custom-port-label';
import { buildPortDisplays } from '@/editor-graph/port-displays';
import type { NodeBalanceLine, PortDisplay } from '@/editor-graph/port-display-types';
import { mergedNodePortIds } from '@/editor-graph/scheme-port-ids';
import { normalizePortId } from '@/shared/ports';
import { flowLabel } from '@/shared/flow-label';
import type { TfgpEdge, TfgpMachineNode, TfgpCustomMachineNode } from '@/schema/tfgp-types';

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
    node.voltageTier,
    recipeReady,
    portLabels,
    balance,
  ].join('\0');
}

export function customNodeAsScheme(node: TfgpCustomMachineNode): SchemeNode {
  return {
    id: node.id,
    kind: 'custom_machine',
    machineId: '__custom__',
    recipeId: `custom:${node.id}`,
    machineCount: node.machineCount,
    overclock: node.overclock,
    voltageTier: 'LV',
    durationTicks: node.durationTicks,
    customInputs: node.inputs,
    customOutputs: node.outputs,
    primaryOutputIndex: node.primaryOutputIndex,
  };
}

/** Port labels and flow rates for custom_machine nodes. */
export function buildCustomMachinePortDisplaysForNode(
  node: TfgpCustomMachineNode,
  edges: readonly TfgpEdge[],
  pack: PackLike,
  lang: 'ru' | 'en',
  connectedIn: Set<string>,
  connectedOut: Set<string>,
  flowResult?: FlowResult,
  t?: TFunction,
  emptyPortLabel = '—',
): MachinePortDisplayBundle {
  const schemeNode = customNodeAsScheme(node);
  const recipe = customMachineAsRecipe(schemeNode);
  const { inputPortIds, outputPortIds } = mergedNodePortIds(
    node.id,
    edges,
    node.inputs.length,
    node.outputs.length,
  );

  const patchLabels = (bundle: MachinePortDisplayBundle): MachinePortDisplayBundle => {
    applyCustomPortLabels(
      bundle.inputPorts,
      node.inputs,
      edges,
      node.id,
      pack,
      lang,
      'in',
      emptyPortLabel,
    );
    applyCustomPortLabels(
      bundle.outputPorts,
      node.outputs,
      edges,
      node.id,
      pack,
      lang,
      'out',
      emptyPortLabel,
    );
    return bundle;
  };

  if (flowResult && t && recipe) {
    const inputRates = rateMapToStrings(flowResult.nodeInputRates[node.id]);
    const outputRates = rateMapToStrings(flowResult.nodeOutputRates[node.id]);
    const outputPortRateRationals = flowResult.nodePortOutputRates[node.id];
    const inputPortLoadMeta = buildInputPortLoadMeta(
      schemeNode,
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
    return patchLabels({
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
    });
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
    return patchLabels({ inputPorts, outputPorts, balanceLines: [] });
  }

  return patchLabels({
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
  });
}
