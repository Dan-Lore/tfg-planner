import type { FlowResult } from '@/calculator/flow-solver';
import { Rational } from '@/calculator/rational';

interface RationalLike {
  num: bigint | string;
  den: bigint | string;
}

function isRationalLike(value: unknown): value is RationalLike {
  return (
    typeof value === 'object' &&
    value !== null &&
    'num' in value &&
    'den' in value &&
    (typeof (value as RationalLike).num === 'bigint' ||
      typeof (value as RationalLike).num === 'string') &&
    (typeof (value as RationalLike).den === 'bigint' ||
      typeof (value as RationalLike).den === 'string')
  );
}

export function reviveRational(value: unknown): Rational {
  if (value instanceof Rational) return value;
  if (isRationalLike(value)) {
    const num = typeof value.num === 'string' ? BigInt(value.num) : value.num;
    const den = typeof value.den === 'string' ? BigInt(value.den) : value.den;
    return new Rational(num, den);
  }
  throw new Error('Expected Rational value');
}

function dehydrateRational(value: Rational): { num: string; den: string } {
  return { num: value.num.toString(), den: value.den.toString() };
}

function dehydrateRationalMap(map: Record<string, Rational>): Record<string, { num: string; den: string }> {
  const out: Record<string, { num: string; den: string }> = {};
  for (const [key, value] of Object.entries(map)) {
    out[key] = dehydrateRational(value);
  }
  return out;
}

function dehydrateNestedRationalMap(
  map: Record<string, Record<string, Rational>>,
): Record<string, Record<string, { num: string; den: string }>> {
  const out: Record<string, Record<string, { num: string; den: string }>> = {};
  for (const [nodeId, inner] of Object.entries(map)) {
    out[nodeId] = dehydrateRationalMap(inner);
  }
  return out;
}

/** JSON-safe copy for localStorage (bigint → string). */
export function dehydrateFlowResult(result: FlowResult): FlowResult {
  return {
    edgeFlows: dehydrateRationalMap(result.edgeFlows) as unknown as FlowResult['edgeFlows'],
    edgeTargetFlows: dehydrateRationalMap(result.edgeTargetFlows) as unknown as FlowResult['edgeTargetFlows'],
    nodeOutputRates: dehydrateNestedRationalMap(result.nodeOutputRates) as unknown as FlowResult['nodeOutputRates'],
    nodePortOutputRates: dehydrateNestedRationalMap(
      result.nodePortOutputRates,
    ) as unknown as FlowResult['nodePortOutputRates'],
    nodeInputRates: dehydrateNestedRationalMap(result.nodeInputRates) as unknown as FlowResult['nodeInputRates'],
    nodePortDeficit: dehydrateNestedRationalMap(result.nodePortDeficit) as unknown as FlowResult['nodePortDeficit'],
    nodePortInLoad: dehydrateNestedRationalMap(result.nodePortInLoad) as unknown as FlowResult['nodePortInLoad'],
    nodePortOutRecipeLoad: dehydrateNestedRationalMap(
      result.nodePortOutRecipeLoad,
    ) as unknown as FlowResult['nodePortOutRecipeLoad'],
    nodePortOutConsumerLoad: dehydrateNestedRationalMap(
      result.nodePortOutConsumerLoad,
    ) as unknown as FlowResult['nodePortOutConsumerLoad'],
    nodePortDownstreamDemand: dehydrateNestedRationalMap(
      result.nodePortDownstreamDemand,
    ) as unknown as FlowResult['nodePortDownstreamDemand'],
    nodeInputLimitedPortOutputRates: dehydrateNestedRationalMap(
      result.nodeInputLimitedPortOutputRates,
    ) as unknown as FlowResult['nodeInputLimitedPortOutputRates'],
    nodeEffectivePortOutputRates: dehydrateNestedRationalMap(
      result.nodeEffectivePortOutputRates,
    ) as unknown as FlowResult['nodeEffectivePortOutputRates'],
    nodePortOutCapacityLoad: dehydrateNestedRationalMap(
      result.nodePortOutCapacityLoad,
    ) as unknown as FlowResult['nodePortOutCapacityLoad'],
    nodePortOutLoad: dehydrateNestedRationalMap(result.nodePortOutLoad) as unknown as FlowResult['nodePortOutLoad'],
    nodeMaxLoad: dehydrateRationalMap(result.nodeMaxLoad) as unknown as FlowResult['nodeMaxLoad'],
    nodeCurrentLoad: dehydrateRationalMap(result.nodeCurrentLoad) as unknown as FlowResult['nodeCurrentLoad'],
    nodeLoad: dehydrateRationalMap(result.nodeLoad) as unknown as FlowResult['nodeLoad'],
    nodeSurplus: dehydrateNestedRationalMap(result.nodeSurplus) as unknown as FlowResult['nodeSurplus'],
    nodeMachineCounts: result.nodeMachineCounts,
  };
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
