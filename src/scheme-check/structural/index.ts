import { buildRecipeMapForScheme } from '@/calculator/custom-machine-recipe';
import type { Recipe } from '@/data/types';
import type { PackData } from '@/data/types';
import type { TfgpNode } from '@/schema/tfgp';

export { checkEdge } from '@/scheme-check/structural/check-edge';
export {
  checkDisconnectedInputs,
  checkDisconnectedOutputs,
} from '@/scheme-check/structural/check-disconnected';
export { checkOrphanStartBuffers } from '@/scheme-check/structural/check-orphan-buffers';

export function recipeMapFromPack(pack: PackData, nodes: TfgpNode[]): Map<string, Recipe> {
  return buildRecipeMapForScheme(pack, nodes);
}
