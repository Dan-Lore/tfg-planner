import type { PackLike } from '@/data/pack-registry';
import { getItemName } from '@/data/pack-registry';
import type { Flow } from '@/data/types';
import { formatFlowQuantityLabel } from '@/shared/flow-chance';

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
