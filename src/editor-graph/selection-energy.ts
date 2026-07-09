import type { Recipe } from '@/data/types';
import type { TfgpCustomMachineNode, TfgpNode } from '@/schema/tfgp';
import {
  customMachineAsRecipe,
  customMachineRecipeId,
} from '@/calculator/custom-machine-recipe';
import { effectiveEuPerTick } from '@/calculator/energy';
import type { SchemeNode } from '@/calculator/flow-solver-types';
import { isCustomMachineNode, isMachineNode } from '@/shared/node-kind';

function customNodeToScheme(node: TfgpCustomMachineNode): SchemeNode {
  return {
    id: node.id,
    kind: 'custom_machine',
    machineId: '__custom__',
    recipeId: customMachineRecipeId(node.id),
    machineCount: node.machineCount,
    overclock: node.overclock,
    voltageTier: 'LV',
    durationTicks: node.durationTicks,
    customInputs: node.inputs,
    customOutputs: node.outputs,
    primaryOutputIndex: node.primaryOutputIndex,
  };
}

/** Sum effective EU/t for selected machine nodes that have pack energy data. */
export function sumSelectionEnergyEuPerTick(
  nodes: readonly TfgpNode[],
  selectedNodeIds: readonly string[],
  resolveRecipe: (recipeId: string) => Recipe | undefined,
): number | undefined {
  const idSet = new Set(selectedNodeIds);
  let sum = 0;
  let hasAny = false;

  for (const node of nodes) {
    if (!idSet.has(node.id)) continue;
    if (!isMachineNode(node) && !isCustomMachineNode(node)) continue;

    const recipe = isCustomMachineNode(node)
      ? customMachineAsRecipe(customNodeToScheme(node))
      : resolveRecipe(node.recipeId);
    if (!recipe) continue;
    const tier = isMachineNode(node) ? node.voltageTier : 'LV';
    const eu = effectiveEuPerTick(recipe, tier);
    if (eu === undefined) continue;

    hasAny = true;
    sum += eu * node.machineCount;
  }

  return hasAny ? sum : undefined;
}
