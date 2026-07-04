import type { TfgpNode, TfgpCustomMachineNode } from '@/schema/tfgp-types';
import type { VoltageTier } from '@/calculator/gt-voltage';
import { normalizeNodeVoltage } from '@/lib/node-voltage';
import { isBufferNode, isCustomMachineNode } from '@/lib/node-kind';
import { clampNonNegativeInt } from '@/lib/buffer-defaults';

/** Raw node from `.tfgp` JSON; may include legacy fields stripped on import. */
export type RawTfgpNode = TfgpNode & {
  outputMultiplier?: number;
  /** Legacy: merged into machineCount on import. */
  parallel?: number;
};

const DEFAULT_CUSTOM_DURATION_TICKS = 20;

function clampPositiveAmount(amount: number): number {
  if (!Number.isFinite(amount) || amount <= 0) return 1;
  return amount;
}

export function normalizeCustomMachineNode(node: TfgpCustomMachineNode): TfgpCustomMachineNode {
  const durationTicks = clampNonNegativeInt(node.durationTicks ?? DEFAULT_CUSTOM_DURATION_TICKS);
  const safeDuration = durationTicks > 0 ? durationTicks : DEFAULT_CUSTOM_DURATION_TICKS;
  const overclock = node.overclock != null && node.overclock > 0 ? node.overclock : 1;
  return {
    ...node,
    kind: 'custom_machine',
    durationTicks: safeDuration,
    machineCount: Math.max(1, Math.ceil(node.machineCount ?? 1)),
    overclock,
    inputs: (node.inputs ?? []).map(({ label: rawLabel, ...p }) => {
      const label = rawLabel?.trim();
      return {
        ...p,
        ...(label ? { label } : {}),
        amount: clampPositiveAmount(p.amount),
      };
    }),
    outputs: (node.outputs ?? []).map(({ label: rawLabel, ...p }) => {
      const label = rawLabel?.trim();
      return {
        ...p,
        ...(label ? { label } : {}),
        amount: clampPositiveAmount(p.amount),
      };
    }),
  };
}

export function normalizeBufferNode(node: TfgpNode): TfgpNode {
  if (!isBufferNode(node)) return node;
  const capacity = clampNonNegativeInt(node.capacity ?? 0);
  if (node.kind === 'start_buffer') {
    return {
      ...node,
      capacity,
      supplyRate:
        node.supplyRate != null
          ? clampNonNegativeInt(node.supplyRate)
          : node.supplyRate,
      initialStock:
        node.initialStock != null
          ? clampNonNegativeInt(node.initialStock)
          : node.initialStock,
      supplyMode: node.supplyMode ?? 'rate',
      autoSupplyRate: node.autoSupplyRate ?? true,
    };
  }
  return { ...node, capacity };
}

export function normalizeNodeScaling(node: RawTfgpNode): TfgpNode {
  if (isBufferNode(node)) {
    return normalizeBufferNode(node);
  }
  if (isCustomMachineNode(node)) {
    return normalizeCustomMachineNode(node);
  }
  let machineCount = Math.max(1, node.machineCount ?? 1);
  const parallel = Math.max(1, node.parallel ?? 1);
  if (parallel !== 1) {
    machineCount = machineCount * parallel;
  }
  const outputMultiplier = node.outputMultiplier;
  if (outputMultiplier != null && outputMultiplier !== 1) {
    machineCount = Math.max(1, Math.ceil(machineCount * outputMultiplier));
  }
  const { outputMultiplier: _om, parallel: _parallel, ...rest } = node;
  const voltageTier: VoltageTier = rest.voltageTier ?? 'LV';
  return normalizeNodeVoltage(
    {
      ...rest,
      machineCount,
      voltageTier,
    },
    undefined,
  );
}
