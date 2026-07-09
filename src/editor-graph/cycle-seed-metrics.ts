import type { Recipe } from '@/data/types';
import {
  BUFFER_HORIZON_SEC,
  isSchemeIntermediateBuffer,
  isSchemeStartBuffer,
} from '@/calculator/buffer-solver';
import { R, type Rational } from '@/calculator/rational';
import type { CycleSeedInfo, SchemeEdge, SchemeNode } from '@/calculator/flow-solver-types';

const REPRODUCTION_SELF_SUFFICIENT_EPS = 0.5;
const NET_BALANCE_EPS = 1e-6;
const STOCHASTIC_Z_SCORE_99 = 2.33;

/** produce / consume × 100 when the loop consumes the seed product internally. */
export function computeReproductionPercent(
  produce: Rational,
  consume: Rational,
): number | undefined {
  if (consume.compare(R.zero) <= 0) return undefined;
  const ratio = produce.div(consume).toNumber() * 100;
  if (!Number.isFinite(ratio)) return undefined;
  return Math.round(ratio * 10) / 10;
}

/** Expected items/s → catalyst attempts/s (divide by chance probability). */
export function catalystAttemptRate(expectedPerSec: number, chance?: number): number {
  if (!Number.isFinite(expectedPerSec) || expectedPerSec <= 0) return 0;
  if (chance === undefined || chance >= 10000) return expectedPerSec;
  const probability = chance / 10000;
  if (probability <= 0) return expectedPerSec;
  return expectedPerSec / probability;
}

/** Reproduction from attempt rates (≈100% when attempts match in a closed catalyst loop). */
export function computeCatalystReproductionPercent(
  produceAttempts: number,
  consumeAttempts: number,
): number | undefined {
  if (consumeAttempts <= 0) return undefined;
  const ratio = (produceAttempts / consumeAttempts) * 100;
  if (!Number.isFinite(ratio)) return undefined;
  return Math.round(ratio * 10) / 10;
}

export interface StochasticCatalystBufferResult {
  capacity: number;
  attemptsPerHour: number;
  chancePercent: number;
  mean: number;
  stdDev: number;
  zScore: number;
}

/** 99% binomial reserve: ⌈μ + z·σ⌉ plus optional deficit hour stock. */
export function computeStochasticCatalystBuffer({
  attemptsPerSec,
  chance,
  horizonSec = BUFFER_HORIZON_SEC,
  zScore = STOCHASTIC_Z_SCORE_99,
  deficitPerSec = 0,
}: {
  attemptsPerSec: number;
  chance: number;
  horizonSec?: number;
  zScore?: number;
  deficitPerSec?: number;
}): StochasticCatalystBufferResult {
  const chancePercent = chance / 100;
  const probability = chance / 10000;
  const attemptsPerHour = attemptsPerSec * horizonSec;
  const mean = attemptsPerHour * probability;
  const stdDev =
    probability > 0 && probability < 1
      ? Math.sqrt(attemptsPerHour * probability * (1 - probability))
      : 0;
  const stochasticReserve = Math.ceil(mean + zScore * stdDev);
  const deficitReserve =
    deficitPerSec > 0 ? Math.ceil(deficitPerSec * horizonSec) : 0;
  return {
    capacity: stochasticReserve + deficitReserve,
    attemptsPerHour,
    chancePercent,
    mean,
    stdDev,
    zScore,
  };
}

export function isCycleSeedSelfSufficient(
  reproductionPercent: number | undefined,
  expectedNetPerSecond: number,
): boolean {
  if (reproductionPercent === undefined) return false;
  return (
    Math.abs(reproductionPercent - 100) < REPRODUCTION_SELF_SUFFICIENT_EPS &&
    Math.abs(expectedNetPerSecond) < NET_BALANCE_EPS
  );
}

export function resolveCycleSeedDisplayMode(
  reproductionPercent: number | undefined,
  expectedNetPerSecond: number,
): 'self-sufficient' | CycleSeedInfo['mode'] {
  if (isCycleSeedSelfSufficient(reproductionPercent, expectedNetPerSecond)) {
    return 'self-sufficient';
  }
  if (Math.abs(expectedNetPerSecond) < NET_BALANCE_EPS) return 'stable';
  return expectedNetPerSecond < 0 ? 'deficit' : 'surplus';
}

export function formatReproductionPercent(value: number | undefined, stable: boolean): string {
  if (value === undefined) return stable ? '~100' : '—';
  if (stable && value >= 99.5 && value <= 100.5) return '~100';
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(1);
}

/** Recommended stock in the seed intermediate buffer (capacity or initial stock). */
export function resolveBufferMaintainAmount(source: SchemeNode | undefined): number | undefined {
  if (!source || !isSchemeIntermediateBuffer(source)) return undefined;
  const stock = source.initialStock ?? 0;
  const cap = source.capacity ?? 0;
  const amount = Math.max(stock, cap);
  return amount > 0 ? amount : undefined;
}

/** Product fed into the SCC from an infinite start buffer — not a closed-loop balance issue. */
export function isProductExternallySuppliedToScc(
  sccNodeIds: ReadonlySet<string>,
  productId: string,
  nodes: readonly SchemeNode[],
  edges: readonly SchemeEdge[],
): boolean {
  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  for (const edge of edges) {
    if (sccNodeIds.has(edge.source)) continue;
    if (!sccNodeIds.has(edge.target)) continue;
    const edgeKey = edge.itemId ?? edge.fluidId ?? '';
    if (edgeKey !== productId) continue;
    const source = nodeById.get(edge.source);
    if (!source || !isSchemeStartBuffer(source)) continue;
    if (source.autoSupplyRate) return true;
    if (source.supplyMode === 'stock') {
      const stock = source.initialStock ?? 0;
      if (stock > 0) return true;
    }
  }
  return false;
}

export function seedProductKey(sccIndex: number, productId: string): string {
  return `${sccIndex}\0${productId}`;
}

export interface CatalystPortChances {
  consumerChance?: number;
  producerChance?: number;
}

/** GT chance on input (consumer) and output (producer) ports for a seed product in an SCC. */
export function findCatalystPortChancesInScc(
  sccNodeIds: ReadonlySet<string>,
  productId: string,
  nodes: readonly SchemeNode[],
  recipes: Map<string, Recipe>,
): CatalystPortChances {
  let consumerChance: number | undefined;
  let producerChance: number | undefined;

  for (const nodeId of sccNodeIds) {
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) continue;
    const recipe = recipes.get(node.recipeId);
    if (!recipe) continue;

    for (const input of recipe.inputs) {
      const key = input.itemId ?? input.fluidId ?? '';
      if (key !== productId) continue;
      if (input.chance !== undefined && input.chance < 10000) {
        consumerChance = input.chance;
      }
    }

    for (const output of recipe.outputs) {
      const key = output.itemId ?? output.fluidId ?? '';
      if (key !== productId) continue;
      if (output.chance !== undefined && output.chance < 10000) {
        producerChance = output.chance;
      }
    }
  }

  return { consumerChance, producerChance };
}

/**
 * Recommended intermediate-buffer stock (items) for a 1 h horizon.
 * Independent of the buffer's configured capacity — based on cycle balance only.
 */
export function computeRecommendedBufferCapacity(
  mode: CycleSeedInfo['mode'],
  netPerSecond: number,
  theoreticalDemandPerSecond: number,
): number {
  const absNet = Math.abs(netPerSecond);
  const hourDemand = theoreticalDemandPerSecond * BUFFER_HORIZON_SEC;
  if (mode === 'deficit') {
    return Math.ceil(absNet * BUFFER_HORIZON_SEC + hourDemand);
  }
  if (mode === 'surplus') {
    return Math.ceil(absNet * BUFFER_HORIZON_SEC);
  }
  return Math.ceil(hourDemand);
}

export interface CatalystSeedCapacityInput {
  mode: CycleSeedInfo['mode'];
  expectedNetPerSecond: number;
  expectedConsumePerSecond: number;
  consumeAttemptPerSecond: number;
  consumerChance?: number;
  theoreticalDemandPerSecond: number;
}

/** Stochastic reserve for chanced catalyst; legacy formula otherwise. */
export function computeCatalystSeedCapacity(
  input: CatalystSeedCapacityInput,
): { capacity: number; detail?: StochasticCatalystBufferResult } {
  const {
    mode,
    expectedNetPerSecond,
    expectedConsumePerSecond,
    consumeAttemptPerSecond,
    consumerChance,
    theoreticalDemandPerSecond,
  } = input;

  if (
    consumerChance !== undefined &&
    consumerChance < 10000 &&
    consumeAttemptPerSecond > 0
  ) {
    const deficitPerSec =
      expectedConsumePerSecond > 0 &&
      expectedNetPerSecond < -NET_BALANCE_EPS
        ? Math.abs(expectedNetPerSecond)
        : 0;
    const detail = computeStochasticCatalystBuffer({
      attemptsPerSec: consumeAttemptPerSecond,
      chance: consumerChance,
      deficitPerSec,
    });
    return { capacity: detail.capacity, detail };
  }

  return {
    capacity: computeRecommendedBufferCapacity(
      mode,
      expectedNetPerSecond,
      theoreticalDemandPerSecond,
    ),
  };
}

function finiteOr(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** Backfill fields missing from cached / older flow results. */
export function normalizeCycleSeedInfo(seed: CycleSeedInfo): CycleSeedInfo {
  const seedFlowPerSecond = finiteOr(seed.seedFlowPerSecond, 0);
  const netPerSecond = finiteOr(seed.netPerSecond, 0);
  const mode = seed.mode ?? 'stable';
  const theoreticalDemandPerSecond = finiteOr(
    seed.theoreticalDemandPerSecond,
    seedFlowPerSecond,
  );
  const producePerSecond = finiteOr(seed.producePerSecond, 0);
  const consumePerSecond = finiteOr(seed.consumePerSecond, 0);
  const produceAttemptPerSecond = finiteOr(
    seed.produceAttemptPerSecond,
    catalystAttemptRate(producePerSecond, seed.catalystChance),
  );
  const consumeAttemptPerSecond = finiteOr(
    seed.consumeAttemptPerSecond,
    catalystAttemptRate(consumePerSecond, seed.catalystChance),
  );
  const reproductionPercent =
    seed.reproductionPercent ??
    computeCatalystReproductionPercent(produceAttemptPerSecond, consumeAttemptPerSecond) ??
    computeReproductionPercent(R.from(producePerSecond), R.from(consumePerSecond));
  const capacityResult =
    seed.recommendedCapacityDetail !== undefined
      ? { capacity: finiteOr(seed.recommendedCapacity, 0), detail: seed.recommendedCapacityDetail }
      : computeCatalystSeedCapacity({
          mode,
          expectedNetPerSecond: netPerSecond,
          expectedConsumePerSecond: consumePerSecond,
          consumeAttemptPerSecond,
          consumerChance: seed.catalystChance,
          theoreticalDemandPerSecond,
        });
  const recommendedCapacity = finiteOr(
    seed.recommendedCapacity,
    capacityResult.capacity,
  );
  return {
    ...seed,
    seedFlowPerSecond,
    netPerSecond,
    mode,
    theoreticalDemandPerSecond,
    recommendedCapacity,
    producePerSecond,
    consumePerSecond,
    produceAttemptPerSecond,
    consumeAttemptPerSecond,
    reproductionPercent,
    recommendedCapacityDetail: seed.recommendedCapacityDetail ?? capacityResult.detail,
  };
}
