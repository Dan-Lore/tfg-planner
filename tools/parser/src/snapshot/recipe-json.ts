import type { RecipeOp } from '../types.js';

interface GtRecipeJson {
  type?: string;
  duration?: number;
  inputs?: Record<string, unknown>;
  outputs?: Record<string, unknown>;
  tickInputs?: Record<string, unknown>;
  tickOutputs?: Record<string, unknown>;
}

function parseContentEntry(
  content: unknown,
  chance: number | undefined,
): RecipeOp['inputs'][number] | null {
  if (!content || typeof content !== 'object') return null;

  const c = content as Record<string, unknown>;

  if (c.type === 'gtceu:circuit') {
    const cfg = (c.configuration as number | undefined) ?? 1;
    return { itemId: 'gtceu:programmed_circuit', amount: cfg };
  }
  if (c.type === 'gtceu:sized' && c.ingredient && typeof c.ingredient === 'object') {
    const ing = c.ingredient as { item?: string; tag?: string };
    const amount = (c.count as number | undefined) ?? 1;
    if (ing.tag) return withChance({ itemId: `#${ing.tag.replace(/^#/, '')}`, amount }, chance);
    if (ing.item) return withChance({ itemId: ing.item, amount }, chance);
  }

  if (typeof c.item === 'string') {
    return withChance(
      { itemId: c.item, amount: (c.amount as number | undefined) ?? 1 },
      chance,
    );
  }

  if (typeof c.fluid === 'string') {
    return withChance(
      { fluidId: c.fluid, amount: (c.amount as number | undefined) ?? 1 },
      chance,
    );
  }

  if (c.value && Array.isArray(c.value)) {
    const amount = (c.amount as number | undefined) ?? 1;
    for (const v of c.value) {
      if (!v || typeof v !== 'object') continue;
      const entry = v as { fluid?: string; tag?: string };
      if (entry.fluid) {
        return withChance({ fluidId: entry.fluid, amount }, chance);
      }
      if (entry.tag) {
        return withChance({ fluidId: `#${entry.tag.replace(/^#/, '')}`, amount }, chance);
      }
    }
  }

  return null;
}

function withChance(
  flow: RecipeOp['inputs'][number],
  chance: number | undefined,
): RecipeOp['inputs'][number] {
  if (chance !== undefined && chance > 0 && chance < 10_000) {
    return { ...flow, chance };
  }
  return flow;
}

function flowsFromJsonSide(side: unknown): RecipeOp['inputs'] {
  const flows: RecipeOp['inputs'] = [];
  if (!side || typeof side !== 'object') return flows;
  const obj = side as Record<string, unknown>;

  for (const key of ['item', 'fluid'] as const) {
    const arr = obj[key];
    if (!Array.isArray(arr)) continue;
    for (const entry of arr) {
      if (!entry || typeof entry !== 'object') continue;
      const e = entry as { content?: unknown; chance?: number };
      const flow = parseContentEntry(e.content, e.chance);
      if (flow) flows.push(flow);
    }
  }

  return flows;
}

import { normalizeRecipeEnergy } from '../pipeline/sanitize-energy.js';
import { extractCircuitFromFlows } from '../pipeline/extract-circuit.js';

function energyFromTickInputs(
  tickInputs: unknown,
  machineId: string,
): RecipeOp['energy'] | undefined {
  if (!tickInputs || typeof tickInputs !== 'object') return undefined;
  const eu = (tickInputs as Record<string, unknown>).eu;
  if (!Array.isArray(eu) || eu.length === 0) return undefined;
  const first = eu[0] as { content?: number } | undefined;
  if (first?.content == null) return undefined;
  const normalized = normalizeRecipeEnergy({ euPerTick: first.content }, machineId);
  return normalized?.energy;
}
export function machineIdFromRecipeType(type: string): string {
  if (type.startsWith('gtceu:')) {
    const m = type.match(/^gtceu:([^/]+)/);
    if (m) return `gtceu:${m[1]}`;
  }
  if (type.startsWith('minecraft:')) return type;
  if (type.includes(':')) return type;
  return `minecraft:${type}`;
}

export function recipeIdFromDumpPath(relativePath: string): string {
  const normalized = relativePath.replace(/\\/g, '/');
  const noExt = normalized.replace(/\.json$/i, '');
  if (noExt.includes(':')) return noExt;
  if (noExt.includes('/')) return `gtceu:${noExt}`;
  return `gtceu:${noExt}`;
}

function finishRecipe(
  base: Omit<RecipeOp, 'circuitConfiguration'> & { circuitConfiguration?: number },
): RecipeOp {
  const { productInputs, circuitConfiguration } = extractCircuitFromFlows(base.inputs);
  const recipe: RecipeOp = {
    ...base,
    inputs: productInputs,
  };
  const circuit = circuitConfiguration ?? base.circuitConfiguration;
  if (circuit !== undefined) recipe.circuitConfiguration = circuit;
  return recipe;
}

/** Parse GT runtime dump JSON or flat RecipeOp export entry. */
export function recipeFromSnapshotJson(
  id: string,
  data: Record<string, unknown>,
  source: string,
): { recipe: RecipeOp | null; skipReason?: string } {
  if (data.id && data.machineId && Array.isArray(data.inputs) && Array.isArray(data.outputs)) {
    const flat = data as {
      id: string;
      machineId: string;
      inputs: RecipeOp['inputs'];
      outputs: RecipeOp['outputs'];
      durationTicks: number;
      energy?: RecipeOp['energy'];
      circuitConfiguration?: number;
    };
    if (flat.inputs.length === 0 && flat.outputs.length === 0) {
      return { recipe: null, skipReason: 'empty_io' };
    }
    const energy = flat.energy
      ? normalizeRecipeEnergy(
          flat.energy as import('../types.js').EnergyOp | { euPerTick: number },
          flat.machineId,
        )?.energy
      : undefined;
    return {
      recipe: finishRecipe({
        id: flat.id,
        machineId: flat.machineId,
        inputs: flat.inputs.map((f) => ({ ...f })),
        outputs: flat.outputs.map((f) => ({ ...f })),
        durationTicks: flat.durationTicks,
        ...(energy ? { energy } : {}),
        ...(flat.circuitConfiguration !== undefined
          ? { circuitConfiguration: flat.circuitConfiguration }
          : {}),
        source,
      }),
    };
  }

  const typed = data as GtRecipeJson;
  const type = typed.type ?? '';
  if (!type) {
    return { recipe: null, skipReason: 'missing_type' };
  }
  const machineId = machineIdFromRecipeType(type);
  const recipeId = typeof data.id === 'string' ? data.id : id.includes(':') ? id : `gtceu:${id}`;

  const inputs = [...flowsFromJsonSide(typed.inputs)];
  const outputs = [
    ...flowsFromJsonSide(typed.outputs),
    ...flowsFromJsonSide(typed.tickOutputs),
  ];

  if (inputs.length === 0 && outputs.length === 0) {
    return { recipe: null, skipReason: 'empty_io' };
  }

  const energy = energyFromTickInputs(typed.tickInputs, machineId);
  return {
    recipe: finishRecipe({
      id: recipeId,
      machineId,
      inputs,
      outputs,
      durationTicks: typed.duration ?? 20,
      ...(energy ? { energy } : {}),
      source,
    }),
  };
}
