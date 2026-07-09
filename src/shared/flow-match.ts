import { flowKey } from '@/shared/ports';
import type { Flow } from '@/data/types';
import { expandTagAliases, inferTagsForProduct } from '@/shared/tag-rules';
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

export interface FlowLookupKeyOptions {
  /** Resolve inferred forge/mod tags for concrete product ids (port attach lookup only). */
  inferProductTags?: boolean;
}

export function flowLookupKeys(
  flow: Flow,
  tags: TagIndex,
  options?: FlowLookupKeyOptions,
): string[] {
  const keys = new Set<string>();
  keys.add(flowKey(flow));
  const id = flowProductId(flow);
  if (id && !id.startsWith('#')) {
    const tagIds = new Set<string>(tags.tagsForItem.get(id) ?? []);
    if (options?.inferProductTags) {
      for (const candidate of inferTagsForProduct(id)) {
        for (const tagId of expandTagAliases(candidate)) {
          tagIds.add(tagId);
        }
      }
    }
    for (const tagId of tagIds) {
      keys.add(flowKey(flowWithProductId(flow, tagId)));
    }
  }
  return [...keys];
}

/** Lookup keys when attaching from a port carrying a concrete product id. */
export function flowAttachLookupKeys(flow: Flow, tags: TagIndex): string[] {
  return flowLookupKeys(flow, tags, { inferProductTags: true });
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
