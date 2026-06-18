import type { TfgpNode } from '@/schema/tfgp';

export function perMachineSpeedFactor(overclock: number, outputMultiplier: number): number {
  return overclock * outputMultiplier;
}

export function normalizeNodeScaling(node: TfgpNode): TfgpNode {
  const parallel = Math.max(1, node.parallel ?? 1);
  const machineCount = Math.max(1, node.machineCount ?? 1);
  if (parallel === 1) {
    return { ...node, machineCount, parallel: 1 };
  }
  return {
    ...node,
    machineCount: machineCount * parallel,
    parallel: 1,
  };
}
