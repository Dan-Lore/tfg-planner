import { join } from 'node:path';
import type { FlowOp, RecipeOp } from '../types.js';
import { listKubeJsFiles } from '../kubejs/scanner.js';
import { parseKubeJsFile } from '../kubejs/parse-file.js';
import { parseStartupGlobals } from '../kubejs/parse-globals.js';

export interface EnrichChancesStats {
  kubejsRecipesWithChance: number;
  enrichedRecipes: number;
  enrichedFlows: number;
}

function flowKey(flow: FlowOp): string {
  return `${flow.itemId ?? flow.fluidId ?? ''}:${flow.amount}`;
}

function hasChancedFlow(flows: FlowOp[]): boolean {
  return flows.some((f) => f.chance !== undefined && f.chance > 0 && f.chance < 10_000);
}

function mergeFlowChances(target: FlowOp[], source: FlowOp[]): { flows: FlowOp[]; merged: number } {
  const chanceByKey = new Map<string, number>();
  for (const flow of source) {
    if (flow.chance !== undefined && flow.chance > 0 && flow.chance < 10_000) {
      chanceByKey.set(flowKey(flow), flow.chance);
    }
  }
  let merged = 0;
  const flows = target.map((flow) => {
    if (flow.chance !== undefined) return flow;
    const chance = chanceByKey.get(flowKey(flow));
    if (chance === undefined) return flow;
    merged += 1;
    return { ...flow, chance };
  });
  return { flows, merged };
}

function mergeRecipeChances(snapshot: RecipeOp, kubejs: RecipeOp): { recipe: RecipeOp; merged: number } {
  const out = mergeFlowChances(snapshot.outputs, kubejs.outputs);
  const inp = mergeFlowChances(snapshot.inputs, kubejs.inputs);
  const merged = out.merged + inp.merged;
  if (merged === 0) return { recipe: snapshot, merged: 0 };
  return {
    recipe: { ...snapshot, outputs: out.flows, inputs: inp.flows },
    merged,
  };
}

function parseKubejsRecipes(modpackRoot: string): Map<string, RecipeOp> {
  const serverRoot = join(modpackRoot, 'kubejs', 'server_scripts');
  const startupRoot = join(modpackRoot, 'kubejs', 'startup_scripts');
  const globals = parseStartupGlobals(startupRoot);
  const byId = new Map<string, RecipeOp>();

  for (const file of listKubeJsFiles(serverRoot)) {
    const result = parseKubeJsFile(file, { globals });
    for (const recipe of result.recipes) {
      if (!hasChancedFlow(recipe.outputs) && !hasChancedFlow(recipe.inputs)) continue;
      byId.set(recipe.id, recipe);
    }
  }

  return byId;
}

export function enrichRecipeChances(
  recipes: RecipeOp[],
  modpackRoot: string,
): { recipes: RecipeOp[]; stats: EnrichChancesStats } {
  const kubejsById = parseKubejsRecipes(modpackRoot);
  let enrichedRecipes = 0;
  let enrichedFlows = 0;

  const enriched = recipes.map((recipe) => {
    const kubejs = kubejsById.get(recipe.id);
    if (!kubejs) return recipe;
    const { recipe: mergedRecipe, merged: flowCount } = mergeRecipeChances(recipe, kubejs);
    if (flowCount > 0) {
      enrichedRecipes += 1;
      enrichedFlows += flowCount;
    }
    return mergedRecipe;
  });

  return {
    recipes: enriched,
    stats: {
      kubejsRecipesWithChance: kubejsById.size,
      enrichedRecipes,
      enrichedFlows,
    },
  };
}
