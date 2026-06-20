import type { Node } from '@xyflow/react';

/** Merge store-derived nodes into React Flow state, preserving drag positions. */
export function mergeFlowNodes(prev: Node[], next: Node[]): Node[] {
  const prevById = new Map(prev.map((n) => [n.id, n]));
  return next.map((rf) => {
    const existing = prevById.get(rf.id);
    if (!existing) return rf;
    return {
      ...rf,
      position: existing.position,
      measured: existing.measured ?? rf.measured,
      width: existing.width ?? rf.width,
      height: existing.height ?? rf.height,
    };
  });
}
