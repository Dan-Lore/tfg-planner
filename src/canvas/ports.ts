import type { PackLike } from '@/data/pack-registry';
import { getItemName } from '@/data/pack-registry';
import type { Flow, Recipe } from '@/data/types';
import { formatFlowQuantityLabel } from '@/lib/flow-chance';
import type { TagIndex } from '@/lib/tag-index';
import { flowsCompatible } from '@/lib/flow-match';
import { flowKey, parsePortId } from '@/lib/ports';

export {
  flowKey,
  inputPortId,
  normalizePortId,
  outputPortId,
  parsePortId,
  productKey,
} from '@/lib/ports';

export function flowLabel(
  flow: Flow,
  pack: PackLike,
  lang: 'ru' | 'en',
  amount?: number,
): string {
  const id = flow.itemId ?? flow.fluidId ?? '?';
  const name = getItemName(pack, id, lang);
  const qty = amount ?? flow.amount;
  if (qty !== undefined) {
    return formatFlowQuantityLabel(flow, name, qty);
  }
  return name;
}

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
  node: { kind?: string; itemId?: string; fluidId?: string },
  port: string,
  recipe?: Recipe,
): Flow | null {
  const kind = node.kind ?? 'machine';
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
