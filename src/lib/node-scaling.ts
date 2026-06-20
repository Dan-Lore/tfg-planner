import type { TfgpNode } from '@/schema/tfgp';
import type { VoltageTier } from '@/calculator/gt-voltage';
import { normalizeNodeVoltage } from '@/lib/node-voltage';

/** Raw node from `.tfgp` JSON; may include legacy fields stripped on import. */
export type RawTfgpNode = TfgpNode & {
  outputMultiplier?: number;
};

export function normalizeNodeScaling(node: RawTfgpNode): TfgpNode {
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
