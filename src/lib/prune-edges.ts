import type { PackData } from '@/data/types';
import type { ActivePack } from '@/data/pack-runtime';
import { getRecipe } from '@/data/pack-registry';
import type { TfgpEdge, TfgpNode } from '@/schema/tfgp';
import { nodePortFlow, portsMatch } from '@/canvas/ports';
import { buildTagIndex, buildTagIndexForRecipes, buildTagIndexFromMeta } from '@/lib/tag-index';
import { isMachineNode } from '@/lib/node-kind';

function tagIndexForScheme(
  pack: ActivePack | PackData,
  nodes: TfgpNode[],
): ReturnType<typeof buildTagIndex> {
  if ('recipes' in pack && Array.isArray(pack.recipes)) {
    return buildTagIndex(pack);
  }
  const recipes = [];
  for (const node of nodes) {
    if (!isMachineNode(node)) continue;
    const recipe = getRecipe(pack, node.recipeId);
    if (recipe) recipes.push(recipe);
  }
  return buildTagIndexForRecipes(pack, recipes, buildTagIndexFromMeta(pack));
}

export function pruneInvalidEdges(
  edges: TfgpEdge[],
  nodes: TfgpNode[],
  pack: ActivePack | PackData,
): TfgpEdge[] {
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const tags = tagIndexForScheme(pack, nodes);
  return edges.filter((edge) => {
    const src = nodeById.get(edge.source);
    const tgt = nodeById.get(edge.target);
    if (!src || !tgt) return false;
    const srcRecipe = isMachineNode(src)
      ? getRecipe(pack, src.recipeId)
      : undefined;
    const tgtRecipe = isMachineNode(tgt)
      ? getRecipe(pack, tgt.recipeId)
      : undefined;
    const srcFlow = nodePortFlow(src, edge.sourcePort, srcRecipe);
    const tgtFlow = nodePortFlow(tgt, edge.targetPort, tgtRecipe);
    return portsMatch(srcFlow, tgtFlow, tags);
  });
}
