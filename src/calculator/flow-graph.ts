import type { SchemeEdge } from '@/calculator/flow-solver-types';

export function buildAdjacency(edges: SchemeEdge[]) {
  const incoming = new Map<string, SchemeEdge[]>();
  const outgoing = new Map<string, SchemeEdge[]>();
  for (const e of edges) {
    if (!incoming.has(e.target)) incoming.set(e.target, []);
    if (!outgoing.has(e.source)) outgoing.set(e.source, []);
    incoming.get(e.target)!.push(e);
    outgoing.get(e.source)!.push(e);
  }
  return { incoming, outgoing };
}

export function topologicalOrder(
  nodeIds: string[],
  edges: SchemeEdge[],
): string[] | null {
  const ids = new Set(nodeIds);
  const inDegree = new Map<string, number>();
  const adj = new Map<string, string[]>();
  for (const id of nodeIds) {
    inDegree.set(id, 0);
    adj.set(id, []);
  }
  for (const e of edges) {
    if (!ids.has(e.source) || !ids.has(e.target)) continue;
    adj.get(e.source)!.push(e.target);
    inDegree.set(e.target, (inDegree.get(e.target) ?? 0) + 1);
  }
  const queue = nodeIds.filter((id) => inDegree.get(id) === 0);
  const order: string[] = [];
  while (queue.length > 0) {
    const n = queue.shift()!;
    order.push(n);
    for (const next of adj.get(n) ?? []) {
      const d = (inDegree.get(next) ?? 1) - 1;
      inDegree.set(next, d);
      if (d === 0) queue.push(next);
    }
  }
  return order.length === nodeIds.length ? order : null;
}
