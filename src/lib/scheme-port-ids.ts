import { normalizePortId, parsePortId } from '@/lib/ports';
import type { TfgpEdge } from '@/schema/tfgp-types';

/** Union recipe port indices with ports referenced by scheme edges. */
export function mergedNodePortIds(
  nodeId: string,
  edges: readonly TfgpEdge[],
  recipeInputCount: number,
  recipeOutputCount: number,
): { inputPortIds: string[]; outputPortIds: string[] } {
  const inputIndices = new Set<number>();
  const outputIndices = new Set<number>();

  for (let i = 0; i < recipeInputCount; i++) inputIndices.add(i);
  for (let i = 0; i < recipeOutputCount; i++) outputIndices.add(i);

  for (const edge of edges) {
    if (edge.target === nodeId) {
      const parsed = parsePortId(normalizePortId(edge.targetPort));
      if (parsed?.kind === 'in') inputIndices.add(parsed.index);
    }
    if (edge.source === nodeId) {
      const parsed = parsePortId(normalizePortId(edge.sourcePort));
      if (parsed?.kind === 'out') outputIndices.add(parsed.index);
    }
  }

  return {
    inputPortIds: [...inputIndices]
      .sort((a, b) => a - b)
      .map((i) => `in_${i}`),
    outputPortIds: [...outputIndices]
      .sort((a, b) => a - b)
      .map((i) => `out_${i}`),
  };
}

/** True when every edge endpoint handle exists in node port-id lists. */
export function edgeHandlesReady(
  nodes: readonly { id: string; data?: unknown }[],
  edges: readonly { source: string; target: string; sourceHandle?: string | null; targetHandle?: string | null }[],
): boolean {
  const byNode = new Map<string, { in: Set<string>; out: Set<string> }>();
  for (const node of nodes) {
    const d = node.data as
      | { inputPortIds?: string[]; outputPortIds?: string[] }
      | undefined;
    byNode.set(node.id, {
      in: new Set(d?.inputPortIds ?? []),
      out: new Set(d?.outputPortIds ?? []),
    });
  }
  for (const edge of edges) {
    const src = byNode.get(edge.source);
    const tgt = byNode.get(edge.target);
    if (!src || !tgt) return false;
    if (edge.sourceHandle && !src.out.has(edge.sourceHandle)) return false;
    if (edge.targetHandle && !tgt.in.has(edge.targetHandle)) return false;
  }
  return true;
}
