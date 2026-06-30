import type { TFunction } from 'i18next';
import type { FlowResult } from '@/calculator/flow-solver';
import type { BuildMachineNodeLayoutWidthsInput } from '@/canvas/machine-node-layout';
import {
  clearLayoutWidthGroupCache,
  resolveMachineNodeLayoutWidths,
  type LayoutWidthStoreInput,
} from '@/lib/layout-width-store';
import type { TfgpEdge, TfgpNode } from '@/schema/tfgp-types';
import { getRecipe } from '@/data/pack-registry';
import { isMachineNode } from '@/lib/node-kind';

export interface CachedLayoutWidthInput extends BuildMachineNodeLayoutWidthsInput {
  /** schemeFlowRevision(scheme) — busts cache when topology/flow settings change. */
  revision: string;
  edges: TfgpEdge[];
  packEpoch: number;
}

export function recipeHydrationCount(
  nodes: TfgpNode[],
  pack: CachedLayoutWidthInput['pack'],
): number {
  let ready = 0;
  for (const n of nodes) {
    if (!isMachineNode(n)) continue;
    if (getRecipe(pack, n.recipeId)) ready += 1;
  }
  return ready;
}

/** Resolve layout widths via incremental per-machineId store. */
export function getCachedMachineNodeLayoutWidths(
  input: CachedLayoutWidthInput,
): Record<string, number> {
  const storeInput: LayoutWidthStoreInput = {
    nodes: input.nodes,
    edges: input.edges,
    pack: input.pack,
    lang: input.lang,
    flowResult: input.flowResult,
    connectedIn: input.connectedIn,
    connectedOut: input.connectedOut,
    t: input.t,
    packEpoch: input.packEpoch,
  };
  return resolveMachineNodeLayoutWidths(storeInput);
}

/** @internal test helper */
export function clearLayoutWidthCache(): void {
  clearLayoutWidthGroupCache();
}

export function buildLayoutWidthInput(
  nodes: TfgpNode[],
  edges: TfgpEdge[],
  revision: string,
  lang: 'ru' | 'en',
  pack: BuildMachineNodeLayoutWidthsInput['pack'],
  flowResult: FlowResult | null | undefined,
  connectedIn: Map<string, Set<string>>,
  connectedOut: Map<string, Set<string>>,
  t: TFunction,
  packEpoch: number,
): CachedLayoutWidthInput {
  return {
    revision,
    nodes,
    edges,
    pack,
    lang,
    flowResult: flowResult ?? undefined,
    connectedIn,
    connectedOut,
    t,
    packEpoch,
  };
}
