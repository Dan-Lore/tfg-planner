import type { PackData } from '@/data/types';
import type { TfgpEdge } from '@/schema/tfgp';
import { portFlow, portsMatch } from '@/canvas/ports';

export function pruneInvalidEdges(
  edges: TfgpEdge[],
  nodes: { id: string; recipeId: string }[],
  pack: PackData,
): TfgpEdge[] {
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  return edges.filter((edge) => {
    const src = nodeById.get(edge.source);
    const tgt = nodeById.get(edge.target);
    if (!src || !tgt) return false;
    const srcRecipe = pack.recipes.find((r) => r.id === src.recipeId);
    const tgtRecipe = pack.recipes.find((r) => r.id === tgt.recipeId);
    const srcFlow = portFlow(srcRecipe, edge.sourcePort);
    const tgtFlow = portFlow(tgtRecipe, edge.targetPort);
    return portsMatch(srcFlow, tgtFlow);
  });
}
