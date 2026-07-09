import type { TfgpNode } from '@/schema/tfgp';
import type { ActivePack } from '@/data/pack-runtime';
import type { PackData } from '@/data/types';
import { getRecipe } from '@/data/pack-registry';
import {
  normalizeNodeScaling,
  normalizeBufferNode,
  normalizeCustomMachineNode,
  type RawTfgpNode,
} from '@/lib/node-scaling';
import { normalizeNodeVoltage } from '@/lib/node-voltage';
import { isBufferNode, isCustomMachineNode, isMachineNode } from '@/shared/node-kind';

/** Normalize legacy/missing node fields (voltage tier, scaling) after load or rehydrate. */
export function normalizeSchemeNodes(
  nodes: readonly (TfgpNode | RawTfgpNode)[],
  pack?: ActivePack | PackData | null,
): TfgpNode[] {
  return nodes.map(normalizeNodeScaling).map((n) => {
    if (isBufferNode(n)) return normalizeBufferNode(n);
    if (isCustomMachineNode(n)) return normalizeCustomMachineNode(n);
    if (!pack || !isMachineNode(n)) return n;
    const recipe = getRecipe(pack, n.recipeId);
    return normalizeNodeVoltage(n, recipe);
  });
}
