import type { Flow, PackData, Recipe } from '@/data/types';
import type { TfgpCustomPort, TfgpNode } from '@/schema/tfgp-types';
import { isCustomMachineNode } from '@/lib/node-kind';
import { R, type Rational } from '@/calculator/rational';
import { TICKS_PER_SECOND, type SchemeNode } from '@/calculator/flow-solver-types';

export const CUSTOM_MACHINE_RECIPE_PREFIX = 'custom:';

export function customMachineRecipeId(nodeId: string): string {
  return `${CUSTOM_MACHINE_RECIPE_PREFIX}${nodeId}`;
}

export function isSchemeCustomMachine(node: SchemeNode): boolean {
  return node.kind === 'custom_machine';
}

function customPortToFlow(port: TfgpCustomPort): Flow {
  return {
    itemId: port.itemId,
    fluidId: port.fluidId,
    amount: port.amount,
  };
}

export function customMachineAsRecipe(node: SchemeNode): Recipe | undefined {
  if (!isSchemeCustomMachine(node)) return undefined;
  const inputs = node.customInputs ?? [];
  const outputs = node.customOutputs ?? [];
  if (outputs.length === 0) return undefined;

  return {
    id: customMachineRecipeId(node.id),
    machineId: '__custom__',
    inputs: inputs.map(customPortToFlow),
    outputs: outputs.map(customPortToFlow),
    durationTicks: node.durationTicks ?? 20,
  };
}

export function resolveNodeRecipe(
  node: SchemeNode,
  recipes: Map<string, Recipe>,
): Recipe | undefined {
  if (isSchemeCustomMachine(node)) {
    return recipes.get(customMachineRecipeId(node.id)) ?? customMachineAsRecipe(node);
  }
  return recipes.get(node.recipeId);
}

export function customMachineDurationSec(node: SchemeNode): Rational {
  const ticks = node.durationTicks ?? 20;
  const oc = node.overclock > 0 ? node.overclock : 1;
  return R.from(ticks).div(R.from(oc)).div(R.from(TICKS_PER_SECOND));
}

export function buildRecipeMap(
  pack: PackData,
  nodes: readonly SchemeNode[],
): Map<string, Recipe> {
  const map = new Map(pack.recipes.map((r) => [r.id, r]));
  for (const node of nodes) {
    if (!isSchemeCustomMachine(node)) continue;
    const recipe = customMachineAsRecipe(node);
    if (recipe) map.set(recipe.id, recipe);
  }
  return map;
}

export function customSchemeNodesFromTfgp(nodes: readonly TfgpNode[]): SchemeNode[] {
  return nodes.filter(isCustomMachineNode).map((n) => ({
    id: n.id,
    kind: 'custom_machine' as const,
    machineId: '__custom__',
    recipeId: customMachineRecipeId(n.id),
    machineCount: n.machineCount,
    overclock: n.overclock,
    voltageTier: 'LV' as const,
    durationTicks: n.durationTicks,
    customInputs: n.inputs,
    customOutputs: n.outputs,
    primaryOutputIndex: n.primaryOutputIndex,
  }));
}

export function buildRecipeMapForScheme(
  pack: PackData,
  nodes: readonly TfgpNode[],
): Map<string, Recipe> {
  return buildRecipeMap(pack, customSchemeNodesFromTfgp(nodes));
}
