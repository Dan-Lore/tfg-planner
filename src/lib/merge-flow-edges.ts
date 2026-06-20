import type { Edge } from '@xyflow/react';

/** Merge store-derived edges into React Flow state, preserving local selection. */
export function mergeFlowEdges(prev: Edge[], next: Edge[]): Edge[] {
  const prevById = new Map(prev.map((e) => [e.id, e]));
  return next.map((rf) => {
    const existing = prevById.get(rf.id);
    if (!existing) return rf;
    return { ...rf, selected: existing.selected };
  });
}
