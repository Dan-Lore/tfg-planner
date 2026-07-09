import { isStartBufferNode } from '@/shared/node-kind';
import type { TfgpEdge, TfgpNode } from '@/schema/tfgp';
import type { SchemeIssue } from '@/scheme-check/check-scheme';
import { nodeLabel } from '@/scheme-check/structural/check-edge';

export function checkOrphanStartBuffers(
  nodes: TfgpNode[],
  edges: TfgpEdge[],
): SchemeIssue[] {
  const issues: SchemeIssue[] = [];
  const hasOutgoing = new Set(edges.map((e) => e.source));

  for (const node of nodes) {
    if (!isStartBufferNode(node)) continue;
    if (hasOutgoing.has(node.id)) continue;
    const product = node.itemId ?? node.fluidId ?? '?';
    issues.push({
      severity: 'info',
      code: 'orphan_start_buffer',
      message: `${nodeLabel(node)}: стартовый буфер не подключён к схеме`,
      nodeId: node.id,
      context: { productId: product },
    });
  }

  return issues;
}
