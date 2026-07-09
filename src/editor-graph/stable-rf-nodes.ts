import type { Node } from '@xyflow/react';
import { machineNodeRfStyle } from '@/editor-graph/node-layout-constants';
import { isBufferNode, isCustomMachineNode, isMachineNode } from '@/shared/node-kind';
import { mergedNodePortIds } from '@/editor-graph/scheme-port-ids';
import type { PackLike } from '@/data/pack-registry';
import { getRecipe } from '@/data/pack-registry';
import type { TfgpEdge, TfgpNode } from '@/schema/tfgp-types';

export interface StableRfNodeBuildContext {
  pack: PackLike;
  edges: TfgpEdge[];
  layoutWidthByNodeId: Record<string, number>;
  checkSeverity?: 'error' | 'warning';
  checkTitle?: string;
}

function machineRfSig(
  n: TfgpNode,
  ctx: StableRfNodeBuildContext,
): string {
  if (!isMachineNode(n)) return '';
  const recipe = getRecipe(ctx.pack, n.recipeId);
  const { inputPortIds, outputPortIds } = mergedNodePortIds(
    n.id,
    ctx.edges,
    recipe?.inputs.length ?? 0,
    recipe?.outputs.length ?? 0,
  );
  const layoutWidth = ctx.layoutWidthByNodeId[n.id] ?? 0;
  return [
    n.id,
    n.position.x,
    n.position.y,
    n.machineId,
    n.recipeId,
    n.machineCount,
    n.overclock,
    n.voltageTier,
    inputPortIds.join(','),
    outputPortIds.join(','),
    layoutWidth,
    ctx.checkSeverity ?? '',
    ctx.checkTitle ?? '',
  ].join('|');
}

function bufferRfSig(n: TfgpNode, ctx: StableRfNodeBuildContext): string {
  if (!isBufferNode(n)) return '';
  const recipeInputs = n.kind === 'start_buffer' ? 0 : 1;
  const recipeOutputs = n.kind === 'end_buffer' ? 0 : 1;
  const { inputPortIds, outputPortIds } = mergedNodePortIds(
    n.id,
    ctx.edges,
    recipeInputs,
    recipeOutputs,
  );
  return [
    n.id,
    n.position.x,
    n.position.y,
    n.kind,
    n.itemId ?? '',
    n.fluidId ?? '',
    n.capacity,
    inputPortIds.join(','),
    outputPortIds.join(','),
    ctx.checkSeverity ?? '',
    ctx.checkTitle ?? '',
  ].join('|');
}

function customMachineRfSig(n: TfgpNode, ctx: StableRfNodeBuildContext): string {
  if (!isCustomMachineNode(n)) return '';
  const { inputPortIds, outputPortIds } = mergedNodePortIds(
    n.id,
    ctx.edges,
    n.inputs.length,
    n.outputs.length,
  );
  const layoutWidth = ctx.layoutWidthByNodeId[n.id] ?? 0;
  return [
    n.id,
    n.position.x,
    n.position.y,
    n.durationTicks,
    n.machineCount,
    n.overclock,
    n.label ?? '',
    inputPortIds.join(','),
    outputPortIds.join(','),
    layoutWidth,
    ctx.checkSeverity ?? '',
    ctx.checkTitle ?? '',
  ].join('|');
}

function buildCustomMachineRfNode(
  n: TfgpNode & {
    kind: 'custom_machine';
    position: { x: number; y: number };
    durationTicks: number;
    machineCount: number;
    overclock: number;
    inputs: { itemId?: string; fluidId?: string; amount: number }[];
    outputs: { itemId?: string; fluidId?: string; amount: number }[];
  },
  ctx: StableRfNodeBuildContext,
): Node {
  const { inputPortIds, outputPortIds } = mergedNodePortIds(
    n.id,
    ctx.edges,
    n.inputs.length,
    n.outputs.length,
  );
  const layoutWidth = ctx.layoutWidthByNodeId[n.id];
  const rfStyle = machineNodeRfStyle(layoutWidth);
  return {
    id: n.id,
    type: 'customMachine',
    position: n.position,
    ...(rfStyle ? { style: rfStyle } : {}),
    data: {
      label: n.label,
      durationTicks: n.durationTicks,
      machineCount: n.machineCount,
      overclock: n.overclock,
      inputs: n.inputs,
      outputs: n.outputs,
      pack: ctx.pack,
      checkSeverity: ctx.checkSeverity,
      checkTitle: ctx.checkTitle,
      inputPortIds,
      outputPortIds,
      layoutWidth,
    },
  };
}

function buildMachineRfNode(
  n: TfgpNode & {
    machineId: string;
    recipeId: string;
  machineCount: number;
  overclock: number;
  voltageTier: string;
    position: { x: number; y: number };
  },
  ctx: StableRfNodeBuildContext,
): Node {
  const recipe = getRecipe(ctx.pack, n.recipeId);
  const { inputPortIds, outputPortIds } = mergedNodePortIds(
    n.id,
    ctx.edges,
    recipe?.inputs.length ?? 0,
    recipe?.outputs.length ?? 0,
  );
  const layoutWidth = ctx.layoutWidthByNodeId[n.id];
  const rfStyle = machineNodeRfStyle(layoutWidth);
  return {
    id: n.id,
    type: 'machine',
    position: n.position,
    ...(rfStyle ? { style: rfStyle } : {}),
    data: {
      machineId: n.machineId,
      recipeId: n.recipeId,
      machineCount: n.machineCount,
      overclock: n.overclock,
      voltageTier: n.voltageTier,
      pack: ctx.pack,
      checkSeverity: ctx.checkSeverity,
      checkTitle: ctx.checkTitle,
      inputPortIds,
      outputPortIds,
      layoutWidth,
    },
  };
}

function buildBufferRfNode(
  n: TfgpNode & {
    kind: 'start_buffer' | 'intermediate_buffer' | 'end_buffer';
    position: { x: number; y: number };
    capacity: number;
    itemId?: string;
    fluidId?: string;
  },
  ctx: StableRfNodeBuildContext,
): Node {
  const recipeInputs = n.kind === 'start_buffer' ? 0 : 1;
  const recipeOutputs = n.kind === 'end_buffer' ? 0 : 1;
  const { inputPortIds, outputPortIds } = mergedNodePortIds(
    n.id,
    ctx.edges,
    recipeInputs,
    recipeOutputs,
  );
  return {
    id: n.id,
    type: 'buffer',
    position: n.position,
    data: {
      bufferKind: n.kind,
      itemId: n.itemId,
      fluidId: n.fluidId,
      capacity: n.capacity,
      supplyMode: n.kind === 'start_buffer' ? n.supplyMode : undefined,
      supplyRate: n.kind === 'start_buffer' ? n.supplyRate : undefined,
      initialStock: n.kind === 'start_buffer' ? n.initialStock : undefined,
      autoSupplyRate: n.kind === 'start_buffer' ? n.autoSupplyRate : undefined,
      pack: ctx.pack,
      checkSeverity: ctx.checkSeverity,
      checkTitle: ctx.checkTitle,
      inputPortIds,
      outputPortIds,
    },
  };
}

/** Reuse prior Node object when per-node layout signature is unchanged. */
export function buildStableRfNodes(
  schemeNodes: TfgpNode[],
  cache: Map<string, { sig: string; node: Node }>,
  ctx: StableRfNodeBuildContext,
  issueForNode: (id: string) => { severity?: 'error' | 'warning'; title?: string },
): Node[] {
  const nextIds = new Set(schemeNodes.map((n) => n.id));
  for (const id of [...cache.keys()]) {
    if (!nextIds.has(id)) cache.delete(id);
  }

  return schemeNodes.map((n) => {
    const issue = issueForNode(n.id);
    const nodeCtx: StableRfNodeBuildContext = {
      ...ctx,
      checkSeverity: issue.severity,
      checkTitle: issue.title,
    };
    const sig = isMachineNode(n)
      ? machineRfSig(n, nodeCtx)
      : isCustomMachineNode(n)
        ? customMachineRfSig(n, nodeCtx)
        : bufferRfSig(n, nodeCtx);

    const prev = cache.get(n.id);
    if (prev && prev.sig === sig) return prev.node;

    const node = isBufferNode(n)
      ? buildBufferRfNode(n, nodeCtx)
      : isCustomMachineNode(n)
        ? buildCustomMachineRfNode(n, nodeCtx)
        : buildMachineRfNode(n, nodeCtx);

    cache.set(n.id, { sig, node });
    return node;
  });
}

/** @internal test helper */
export function clearStableRfNodeCache(cache: Map<string, { sig: string; node: Node }>): void {
  cache.clear();
}
