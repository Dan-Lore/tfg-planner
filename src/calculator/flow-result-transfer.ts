import type { FlowResult } from '@/calculator/flow-solver';
import { Rational } from '@/calculator/rational';

interface RationalLike {
  num: bigint;
  den: bigint;
}

function isRationalLike(value: unknown): value is RationalLike {
  return (
    typeof value === 'object' &&
    value !== null &&
    'num' in value &&
    'den' in value &&
    typeof (value as RationalLike).num === 'bigint' &&
    typeof (value as RationalLike).den === 'bigint'
  );
}

export function reviveRational(value: unknown): Rational {
  if (value instanceof Rational) return value;
  if (isRationalLike(value)) return new Rational(value.num, value.den);
  throw new Error('Expected Rational value');
}

function reviveRationalMap(map: Record<string, unknown>): Record<string, Rational> {
  const out: Record<string, Rational> = {};
  for (const [key, value] of Object.entries(map)) {
    out[key] = reviveRational(value);
  }
  return out;
}

function reviveNestedRationalMap(
  map: Record<string, Record<string, unknown>>,
): Record<string, Record<string, Rational>> {
  const out: Record<string, Record<string, Rational>> = {};
  for (const [nodeId, inner] of Object.entries(map)) {
    out[nodeId] = reviveRationalMap(inner);
  }
  return out;
}

/** Restore Rational class methods after structuredClone / worker postMessage. */
export function hydrateFlowResult(raw: FlowResult): FlowResult {
  return {
    edgeFlows: reviveRationalMap(raw.edgeFlows as Record<string, unknown>),
    edgeTargetFlows: reviveRationalMap(raw.edgeTargetFlows as Record<string, unknown>),
    nodeOutputRates: reviveNestedRationalMap(
      raw.nodeOutputRates as Record<string, Record<string, unknown>>,
    ),
    nodePortOutputRates: reviveNestedRationalMap(
      raw.nodePortOutputRates as Record<string, Record<string, unknown>>,
    ),
    nodeInputRates: reviveNestedRationalMap(
      raw.nodeInputRates as Record<string, Record<string, unknown>>,
    ),
    nodePortDeficit: reviveNestedRationalMap(
      raw.nodePortDeficit as Record<string, Record<string, unknown>>,
    ),
    nodePortInLoad: reviveNestedRationalMap(
      raw.nodePortInLoad as Record<string, Record<string, unknown>>,
    ),
    nodePortOutRecipeLoad: reviveNestedRationalMap(
      raw.nodePortOutRecipeLoad as Record<string, Record<string, unknown>>,
    ),
    nodePortOutConsumerLoad: reviveNestedRationalMap(
      raw.nodePortOutConsumerLoad as Record<string, Record<string, unknown>>,
    ),
    nodePortDownstreamDemand: reviveNestedRationalMap(
      raw.nodePortDownstreamDemand as Record<string, Record<string, unknown>>,
    ),
    nodeInputLimitedPortOutputRates: reviveNestedRationalMap(
      raw.nodeInputLimitedPortOutputRates as Record<string, Record<string, unknown>>,
    ),
    nodeEffectivePortOutputRates: reviveNestedRationalMap(
      raw.nodeEffectivePortOutputRates as Record<string, Record<string, unknown>>,
    ),
    nodePortOutCapacityLoad: reviveNestedRationalMap(
      raw.nodePortOutCapacityLoad as Record<string, Record<string, unknown>>,
    ),
    nodePortOutLoad: reviveNestedRationalMap(
      raw.nodePortOutLoad as Record<string, Record<string, unknown>>,
    ),
    nodeMaxLoad: reviveRationalMap(raw.nodeMaxLoad as Record<string, unknown>),
    nodeCurrentLoad: reviveRationalMap(raw.nodeCurrentLoad as Record<string, unknown>),
    nodeLoad: reviveRationalMap(raw.nodeLoad as Record<string, unknown>),
    nodeSurplus: reviveNestedRationalMap(
      raw.nodeSurplus as Record<string, Record<string, unknown>>,
    ),
    nodeMachineCounts: raw.nodeMachineCounts,
  };
}
