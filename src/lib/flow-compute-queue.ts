import type { FlowComputeMode } from '@/workers/flow-worker';

/** Coalesce pending flow updates while worker is busy (recalculate wins). */
export function mergePendingFlowUpdateMode(
  current: FlowComputeMode | null,
  incoming: FlowComputeMode,
): FlowComputeMode {
  if (current === 'recalculate' || incoming === 'recalculate') {
    return 'recalculate';
  }
  return incoming;
}
