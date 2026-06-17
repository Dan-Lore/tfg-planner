import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { RecipeOp } from '../types.js';

interface GtRecipeJson {
  type?: string;
  duration?: number;
  inputs?: Record<string, unknown>;
  outputs?: Record<string, unknown>;
  tickInputs?: Record<string, unknown>;
  tickOutputs?: Record<string, unknown>;
  input?: { fluid?: string; amount?: number; item?: string }[];
  output?: { fluid?: string; amount?: number; item?: string }[];
  recipeConditions?: unknown[];
}

function flowsFromJsonSide(side: unknown): RecipeOp['inputs'] {
  const flows: RecipeOp['inputs'] = [];
  if (!side || typeof side !== 'object') return flows;
  const obj = side as Record<string, unknown>;
  const items = obj.item;
  if (Array.isArray(items)) {
    for (const entry of items) {
      if (!entry || typeof entry !== 'object') continue;
      const e = entry as { content?: { type?: string; item?: string; amount?: number; fluid?: string } };
      const c = e.content;
      if (!c) continue;
      if (c.item) flows.push({ itemId: c.item, amount: c.amount ?? 1 });
      if (c.fluid) flows.push({ fluidId: c.fluid, amount: c.amount ?? 1 });
    }
  }
  const fluids = obj.fluid;
  if (Array.isArray(fluids)) {
    for (const entry of fluids) {
      if (!entry || typeof entry !== 'object') continue;
      const e = entry as { content?: { fluid?: string; amount?: number } };
      if (e.content?.fluid) {
        flows.push({ fluidId: e.content.fluid, amount: e.content.amount ?? 1 });
      }
    }
  }
  return flows;
}

function recipeFromGtJson(id: string, data: GtRecipeJson, source: string): RecipeOp | null {
  const type = data.type ?? '';
  const machineMatch = type.match(/gtceu:([^/]+)/);
  const machineId = machineMatch ? `gtceu:${machineMatch[1]}` : 'gtceu:unknown';

  const inputs = [
    ...flowsFromJsonSide(data.inputs),
    ...flowsFromJsonSide(data.tickInputs),
  ];
  const outputs = [
    ...flowsFromJsonSide(data.outputs),
    ...flowsFromJsonSide(data.tickOutputs),
  ];

  if (inputs.length === 0 && outputs.length === 0) return null;

  return {
    id,
    machineId,
    inputs,
    outputs,
    durationTicks: data.duration ?? 20,
    source,
  };
}

export function loadDatapackRecipes(dataRoot: string): RecipeOp[] {
  const recipes: RecipeOp[] = [];

  function walk(dir: string): void {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of entries) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) {
        walk(full);
      } else if (name.endsWith('.json') && (full.includes('/recipe/') || full.includes('\\recipe\\'))) {
        try {
          const raw = JSON.parse(readFileSync(full, 'utf-8')) as Record<string, GtRecipeJson>;
          for (const [key, val] of Object.entries(raw)) {
            const id = key.includes(':') ? key : `gtceu:${key}`;
            const r = recipeFromGtJson(id, val, full);
            if (r) recipes.push(r);
          }
        } catch {
          /* skip invalid json */
        }
      }
    }
  }

  walk(dataRoot);
  return recipes;
}
