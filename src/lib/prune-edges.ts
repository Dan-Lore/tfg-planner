import type { PackData } from '@/data/types';
import type { TfgpEdge, TfgpNode } from '@/schema/tfgp';
import { nodePortFlow, portsMatch } from '@/canvas/ports';
import { buildTagIndex } from '@/lib/tag-index';
import { isMachineNode } from '@/lib/node-kind';

export function pruneInvalidEdges(
  edges: TfgpEdge[],
  nodes: TfgpNode[],
  pack: PackData,
): TfgpEdge[] {
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const tags = buildTagIndex(pack);
  return edges.filter((edge) => {
    const src = nodeById.get(edge.source);
    const tgt = nodeById.get(edge.target);
    if (!src || !tgt) return false;
    const srcRecipe = isMachineNode(src)
      ? pack.recipes.find((r) => r.id === src.recipeId)
      : undefined;
    const tgtRecipe = isMachineNode(tgt)
      ? pack.recipes.find((r) => r.id === tgt.recipeId)
      : undefined;
    const srcFlow = nodePortFlow(src, edge.sourcePort, srcRecipe);
    const tgtFlow = nodePortFlow(tgt, edge.targetPort, tgtRecipe);
    return portsMatch(srcFlow, tgtFlow, tags);
  });
}
