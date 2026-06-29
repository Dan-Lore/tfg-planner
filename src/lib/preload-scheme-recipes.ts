import type { ActivePack } from '@/data/pack-runtime';
import { getRecipe } from '@/data/pack-registry';
import { isMachineNode } from '@/lib/node-kind';
import type { TfgpFile } from '@/schema/tfgp';

/** Load recipe shards required by scheme machine nodes (parallel). */
export async function preloadSchemeRecipes(
  pack: ActivePack,
  scheme: TfgpFile,
): Promise<{ machineNodes: number; recipesReady: number }> {
  const machineNodes = scheme.nodes.filter(isMachineNode);
  if (machineNodes.length === 0) {
    return { machineNodes: 0, recipesReady: 0 };
  }
  await pack.ensureRecipeIds(machineNodes.map((n) => n.recipeId));
  const recipesReady = machineNodes.filter((n) => getRecipe(pack, n.recipeId)).length;
  return { machineNodes: machineNodes.length, recipesReady };
}
