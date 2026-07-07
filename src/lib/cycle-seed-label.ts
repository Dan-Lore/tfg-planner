import type { TFunction } from 'i18next';
import { formatRate } from '@/calculator/flow-solver';
import { R } from '@/calculator/rational';
import type { CycleSeedInfo } from '@/calculator/flow-solver-types';
import {
  formatFlowRateLabel,
  GT_CHANCE_BASE,
} from '@/lib/flow-chance';
import {
  formatReproductionPercent,
  normalizeCycleSeedInfo,
  resolveCycleSeedDisplayMode,
} from '@/lib/cycle-seed-metrics';

function safeFormatRatePerSecond(value: number | undefined): string {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  return formatRate(R.from(n));
}

export interface CycleSeedInspectorLine {
  key: string;
  text: string;
  title?: string;
}

export function buildCycleSeedInspectorLines(
  t: TFunction,
  seed: CycleSeedInfo,
  productLabel: string,
): CycleSeedInspectorLine[] {
  const normalized = normalizeCycleSeedInfo(seed);
  const displayMode = resolveCycleSeedDisplayMode(
    normalized.reproductionPercent,
    normalized.netPerSecond,
  );
  const selfSufficient = displayMode === 'self-sufficient';
  const reproduction = formatReproductionPercent(
    normalized.reproductionPercent,
    selfSufficient || normalized.mode === 'stable',
  );
  const absNet = safeFormatRatePerSecond(Math.abs(normalized.netPerSecond));
  const produce = safeFormatRatePerSecond(
    normalized.produceAttemptPerSecond ?? normalized.producePerSecond,
  );
  const consume = safeFormatRatePerSecond(normalized.consumePerSecond);
  const lines: CycleSeedInspectorLine[] = [
    {
      key: 'loop',
      text: t('editor.cycleSeed.inspector.loop', {
        index: normalized.sccIndex + 1,
        product: productLabel,
      }),
    },
    {
      key: 'produce',
      text: t('editor.cycleSeed.inspector.produceInLoop', { rate: produce }),
    },
    {
      key: 'consume',
      text: t('editor.cycleSeed.inspector.consumeInLoop', { rate: consume }),
    },
    {
      key: 'reproduction',
      text: t('editor.cycleSeed.inspector.reproduction', { value: reproduction }),
    },
  ];

  if (selfSufficient) {
    lines.push({
      key: 'mode',
      text: t('editor.cycleSeed.inspector.selfSufficient'),
    });
  } else if (normalized.mode === 'deficit') {
    lines.push({
      key: 'mode',
      text: t('editor.cycleSeed.inspector.deficit', { absNet }),
    });
  } else if (normalized.mode === 'surplus') {
    lines.push({
      key: 'mode',
      text: t('editor.cycleSeed.inspector.surplus', { absNet }),
    });
  }

  const capacityLine: CycleSeedInspectorLine = {
    key: 'recommendedCapacity',
    text: t('editor.cycleSeed.inspector.recommendedCapacity', {
      amount: normalized.recommendedCapacity,
    }),
  };
  const detail = normalized.recommendedCapacityDetail;
  if (detail) {
    capacityLine.title = t('editor.cycleSeed.inspector.recommendedCapacityTooltip', {
      attempts: Math.round(detail.attemptsPerHour),
      chance: detail.chancePercent,
      mean: Math.round(detail.mean),
      stdDev: Math.round(detail.stdDev * 10) / 10,
      z: detail.zScore,
      capacity: normalized.recommendedCapacity,
    });
  }
  lines.push(capacityLine);

  if (normalized.bufferMaintainAmount !== undefined) {
    lines.push({
      key: 'currentBuffer',
      text: t('editor.cycleSeed.inspector.currentBuffer', {
        amount: normalized.bufferMaintainAmount,
      }),
    });
  }

  return lines;
}

export function formatCycleSeedTitle(
  t: TFunction,
  seed: CycleSeedInfo,
  productLabel: string,
): string {
  const reproduction = formatReproductionPercent(
    seed.reproductionPercent,
    seed.mode === 'stable',
  );
  const seedFlow = formatRate(R.from(seed.seedFlowPerSecond));
  const net = formatRate(R.from(seed.netPerSecond));
  const absNet = formatRate(R.from(Math.abs(seed.netPerSecond)));

  if (seed.mode === 'stable') {
    if (seed.bufferMaintainAmount !== undefined) {
      return t('editor.cycleSeed.stable', {
        product: productLabel,
        reproduction,
        seedFlow,
        net,
        bufferAmount: seed.bufferMaintainAmount,
      });
    }
    return t('editor.cycleSeed.stableNoBuffer', {
      product: productLabel,
      reproduction,
      seedFlow,
      net,
    });
  }
  if (seed.mode === 'deficit') {
    return t('editor.cycleSeed.deficit', {
      product: productLabel,
      reproduction,
      seedFlow,
      net,
      absNet,
    });
  }
  return t('editor.cycleSeed.surplus', {
    product: productLabel,
    reproduction,
    seedFlow,
    net,
    absNet,
  });
}

/** Target-side edge label on seed edge: loop consumption rate (items/s, always positive). */
export function formatCycleSeedBalanceLabel(
  _t: TFunction,
  seed: CycleSeedInfo,
): string {
  const normalized = normalizeCycleSeedInfo(seed);
  const approximate =
    normalized.catalystChance !== undefined &&
    normalized.catalystChance > 0 &&
    normalized.catalystChance < GT_CHANCE_BASE;
  return formatFlowRateLabel(R.from(normalized.consumePerSecond), approximate);
}
