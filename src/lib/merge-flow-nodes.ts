import type { Node } from '@xyflow/react';

function nodeLayoutWidth(node: Node): number | undefined {
  const w = (node.data as { layoutWidth?: number } | undefined)?.layoutWidth;
  return typeof w === 'number' ? w : undefined;
}

/** Merge store-derived nodes into React Flow state, preserving drag positions. */
export function mergeFlowNodes(prev: Node[], next: Node[]): Node[] {
  const prevById = new Map(prev.map((n) => [n.id, n]));
  return next.map((rf) => {
    const existing = prevById.get(rf.id);
    if (!existing) return rf;

    const nextLayoutWidth = nodeLayoutWidth(rf);
    const prevLayoutWidth = nodeLayoutWidth(existing);
    const layoutWidthChanged =
      nextLayoutWidth != null &&
      (prevLayoutWidth !== nextLayoutWidth ||
        existing.measured?.width !== nextLayoutWidth);

    return {
      ...rf,
      position: existing.position,
      ...(nextLayoutWidth != null ? { width: nextLayoutWidth } : {}),
      measured:
        layoutWidthChanged ? undefined : (existing.measured ?? rf.measured),
    };
  });
}
