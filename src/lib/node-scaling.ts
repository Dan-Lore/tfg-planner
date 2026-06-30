import type { TfgpNode } from '@/schema/tfgp-types';
import type { VoltageTier } from '@/calculator/gt-voltage';
import { normalizeNodeVoltage } from '@/lib/node-voltage';
import { isBufferNode } from '@/lib/node-kind';
import { clampNonNegativeInt } from '@/lib/buffer-defaults';

/** Raw node from `.tfgp` JSON; may include legacy fields stripped on import. */
export type RawTfgpNode = TfgpNode & {
  outputMultiplier?: number;
};

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
  let machineCount = Math.max(1, node.machineCount ?? 1);
  const parallel = Math.max(1, node.parallel ?? 1);
  if (parallel !== 1) {
    machineCount = machineCount * parallel;
  }
  const outputMultiplier = node.outputMultiplier;
  if (outputMultiplier != null && outputMultiplier !== 1) {
    machineCount = Math.max(1, Math.ceil(machineCount * outputMultiplier));
  }
  const { outputMultiplier: _om, ...rest } = node;
  const voltageTier: VoltageTier = rest.voltageTier ?? 'LV';
  return normalizeNodeVoltage(
    {
      ...rest,
      machineCount,
      parallel: 1,
      voltageTier,
    },
    undefined,
  );
}
