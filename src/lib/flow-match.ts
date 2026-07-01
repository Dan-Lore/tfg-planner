import { flowKey } from '@/lib/ports';
import type { Flow } from '@/data/types';
import type { TagIndex } from './tag-index';

export function flowProductId(flow: { itemId?: string; fluidId?: string }): string {
  return flow.itemId ?? flow.fluidId ?? '';
}

export function flowsCompatible(
  a: Flow | null,
  b: Flow | null,
  tags: TagIndex,
): boolean {
  if (!a || !b) return false;
  const aId = flowProductId(a);
  const bId = flowProductId(b);
  if (!aId || !bId) return false;
  if (aId === bId) return true;

  if (aId.startsWith('#')) {
    return tags.members.get(aId)?.has(bId) ?? false;
  }
  if (bId.startsWith('#')) {
    return tags.members.get(bId)?.has(aId) ?? false;
  }
  return false;
}

export function edgeProductMatchesFlow(
  edge: { itemId?: string; fluidId?: string },
  flow: Flow,
  tags: TagIndex,
): boolean {
  const edgeId = flowProductId(edge);
  if (!edgeId) return true;
  const edgeFlow: Flow = edge.fluidId
    ? { fluidId: edge.fluidId, amount: 1 }
    : { itemId: edge.itemId, amount: 1 };
  return flowsCompatible(flow, edgeFlow, tags);
}

function flowWithProductId(flow: Flow, productId: string): Flow {
  if (flow.fluidId) return { fluidId: productId, amount: flow.amount, chance: flow.chance };
  return { itemId: productId, amount: flow.amount, chance: flow.chance };
}

export function flowLookupKeys(
  flow: Flow,
  tags: TagIndex,
): string[] {
  const keys = new Set<string>();
  keys.add(flowKey(flow));
  const id = flowProductId(flow);
  if (id && !id.startsWith('#')) {
    for (const tagId of tags.tagsForItem.get(id) ?? []) {
      keys.add(flowKey(flowWithProductId(flow, tagId)));
    }
  }
  return [...keys];
}

export function recipeInputMatchesProduct(
  inputProductId: string,
  edgeProductId: string,
  tags: TagIndex,
): boolean {
  if (!inputProductId || !edgeProductId) return false;
  if (inputProductId === edgeProductId) return true;
  return flowsCompatible(
    { itemId: inputProductId, amount: 1 },
    { itemId: edgeProductId, amount: 1 },
    tags,
  );
}
