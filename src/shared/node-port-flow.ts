import type { Flow, Recipe } from '@/data/types';
import type { TfgpCustomPort } from '@/schema/tfgp-types';
import { flowsCompatible } from '@/shared/flow-match';
import type { TagIndex } from '@/shared/tag-index';
import { flowKey, parsePortId } from '@/shared/ports';

export function portFlow(recipe: Recipe | undefined, port: string): Flow | null {
  if (!recipe) return null;
  const parsed = parsePortId(port);
  if (!parsed) return null;
  const list = parsed.kind === 'in' ? recipe.inputs : recipe.outputs;
  return list[parsed.index] ?? null;
}

export function bufferProductFlow(node: {
  itemId?: string;
  fluidId?: string;
}): Flow | null {
  if (!node.itemId && !node.fluidId) return null;
  return { itemId: node.itemId, fluidId: node.fluidId, amount: 1 };
}

export function nodePortFlow(
  node: {
    kind?: string;
    itemId?: string;
    fluidId?: string;
    inputs?: TfgpCustomPort[];
    outputs?: TfgpCustomPort[];
  },
  port: string,
  recipe?: Recipe,
): Flow | null {
  const kind = node.kind ?? 'machine';
  if (kind === 'custom_machine') {
    const parsed = parsePortId(port);
    if (!parsed) return null;
    const list = parsed.kind === 'in' ? node.inputs : node.outputs;
    const portDef = list?.[parsed.index];
    if (!portDef) return null;
    if (!portDef.itemId && !portDef.fluidId) return null;
    return {
      itemId: portDef.itemId,
      fluidId: portDef.fluidId,
      amount: portDef.amount,
    };
  }
  if (kind !== 'machine') {
    const parsed = parsePortId(port);
    if (!parsed) return null;
    if (kind === 'start_buffer' && parsed.kind === 'in') return null;
    if (kind === 'end_buffer' && parsed.kind === 'out') return null;
    return bufferProductFlow(node);
  }
  return portFlow(recipe, port);
}

export function portsMatch(
  sourceFlow: Flow | null,
  targetFlow: Flow | null,
  tags?: TagIndex,
): boolean {
  if (!sourceFlow || !targetFlow) return false;
  if (tags) return flowsCompatible(sourceFlow, targetFlow, tags);
  return flowKey(sourceFlow) === flowKey(targetFlow);
}
