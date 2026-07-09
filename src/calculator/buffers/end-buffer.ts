import type { SchemeNode } from '@/calculator/flow-solver-types';
import { R, type Rational } from '@/calculator/rational';
import {
  isSchemeEndBuffer,
  isSchemeIntermediateBuffer,
  isSchemeStartBuffer,
} from '@/calculator/buffer-kind';
import { configuredStartBufferCap } from '@/calculator/buffers/start-buffer-cap';

export function buildBufferPortOutputRates(
  node: SchemeNode,
  effectiveOut: Rational,
): Record<string, Rational> {
  if (isSchemeStartBuffer(node) || isSchemeIntermediateBuffer(node)) {
    return { out_0: effectiveOut };
  }
  return {};
}

export function buildBufferSurplus(
  node: SchemeNode,
  inflow: Rational,
  outflow: Rational,
): Record<string, Rational> {
  const key = node.itemId ?? node.fluidId ?? '';
  if (!key) return {};
  if (isSchemeEndBuffer(node)) {
    if (inflow.compare(R.zero) > 0) return { [key]: inflow };
    return {};
  }
  const surplus = inflow.sub(outflow);
  if (surplus.compare(R.zero) > 0) return { [key]: surplus };
  return {};
}

export function buildBufferNodeLoad(
  node: SchemeNode,
  inflow: Rational,
  outflow: Rational,
): Rational {
  if (isSchemeStartBuffer(node)) {
    const cap = configuredStartBufferCap(node);
    if (cap.compare(R.zero) <= 0 || cap.toNumber() >= Number.MAX_SAFE_INTEGER / 2) {
      return outflow.compare(R.zero) > 0 ? R.from(1) : R.zero;
    }
    return outflow.div(cap);
  }
  if (isSchemeIntermediateBuffer(node)) {
    if (outflow.compare(R.zero) <= 0) return R.zero;
    return inflow.compare(R.zero) > 0 ? outflow.div(inflow) : R.zero;
  }
  if (isSchemeEndBuffer(node)) {
    return inflow.compare(R.zero) > 0 ? R.from(1) : R.zero;
  }
  return R.zero;
}
