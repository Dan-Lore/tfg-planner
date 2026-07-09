import type { SchemeNode } from '@/calculator/flow-solver-types';
import { R, type Rational } from '@/calculator/rational';

export const BUFFER_HORIZON_SEC = 3600;

export function configuredStartBufferCap(node: SchemeNode): Rational {
  if (node.supplyMode === 'stock') {
    const stock = node.initialStock ?? 0;
    return R.from(stock).div(R.from(BUFFER_HORIZON_SEC));
  }
  if (node.autoSupplyRate) {
    return R.from(Number.MAX_SAFE_INTEGER);
  }
  return R.from(node.supplyRate ?? 0);
}
