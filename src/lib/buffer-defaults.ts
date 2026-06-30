import type { FlowResult } from '@/calculator/flow-solver';
import { R } from '@/calculator/rational';
import type { TfgpEdge, TfgpFile } from '@/schema/tfgp-types';
import { BUFFER_HORIZON_SEC } from '@/calculator/buffer-solver';

export function flowRateAtPort(
  flowResult: FlowResult | null,
  nodeId: string,
  portId: string,
  edges: readonly TfgpEdge[],
  direction: 'in' | 'out',
): number {
  if (!flowResult) return 0;
  let total = R.zero;
  for (const edge of edges) {
    if (direction === 'in' && edge.target === nodeId && edge.targetPort === portId) {
      total = total.add(flowResult.edgeFlows[edge.id] ?? R.zero);
    }
    if (direction === 'out' && edge.source === nodeId && edge.sourcePort === portId) {
      total = total.add(flowResult.edgeFlows[edge.id] ?? R.zero);
    }
  }
  return Math.max(0, total.toNumber());
}

export interface BufferDefaults {
  capacity: number;
  supplyRate: number;
  initialStock: number;
}

/** Defaults when attaching a buffer from a port context menu. */
export function estimateBufferDefaults(
  anchorNodeId: string,
  anchorPort: string,
  direction: 'upstream' | 'downstream',
  scheme: Pick<TfgpFile, 'edges'>,
  flowResult: FlowResult | null,
): BufferDefaults {
  const flowPerSec =
    direction === 'downstream'
      ? flowRateAtPort(flowResult, anchorNodeId, anchorPort, scheme.edges, 'out')
      : flowRateAtPort(flowResult, anchorNodeId, anchorPort, scheme.edges, 'in');

  const capacity = Math.max(0, Math.round(flowPerSec * BUFFER_HORIZON_SEC));
  const supplyRate = Math.max(0, Math.round(flowPerSec));
  const initialStock = Math.max(0, Math.round(flowPerSec * BUFFER_HORIZON_SEC));

  return { capacity, supplyRate, initialStock };
}

export function clampNonNegativeInt(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value));
}
