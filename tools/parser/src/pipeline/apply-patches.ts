import type { RecipePatch, RecipeOp } from '../types.js';
import type { RecipeStore } from './recipe-store.js';

function applyFluidOutputAmounts(
  outputs: import('../types.js').FlowOp[],
  amounts: Record<string, number>,
): import('../types.js').FlowOp[] {
  const updated = outputs.map((o) => {
    if (o.fluidId && amounts[o.fluidId] !== undefined) {
      return { ...o, amount: amounts[o.fluidId] };
    }
    return o;
  });
  for (const [fluidId, amount] of Object.entries(amounts)) {
    if (!updated.some((o) => o.fluidId === fluidId)) {
      updated.push({ fluidId, amount });
    }
  }
  return updated;
}

export function applyPatches(
  store: RecipeStore,
  patches: RecipePatch[],
  fallbackRecipes: RecipeOp[] = [],
): number {
  let applied = 0;
  const fallbackById = new Map(fallbackRecipes.map((r) => [r.id, r]));

  for (const patch of patches) {
    const existing = store.get(patch.recipeId) ?? fallbackById.get(patch.recipeId);
    if (!existing) continue;

    const updated = {
      ...existing,
      inputs: [...existing.inputs],
      outputs: [...existing.outputs],
    };

    if (patch.durationTicks !== undefined) {
      updated.durationTicks = patch.durationTicks;
    }
    if (patch.replaceItemInputs) {
      updated.inputs = [
        ...updated.inputs.filter((f) => !f.itemId),
        ...patch.replaceItemInputs,
      ];
    }
    if (patch.replaceInputFluids) {
      updated.inputs = [
        ...updated.inputs.filter((f) => !f.fluidId),
        ...patch.replaceInputFluids,
      ];
    }
    if (patch.replaceItemOutputs) {
      updated.outputs = [
        ...updated.outputs.filter((f) => !f.itemId),
        ...patch.replaceItemOutputs,
      ];
    }
    if (patch.replaceOutputFluids) {
      updated.outputs = [
        ...updated.outputs.filter((f) => !f.fluidId),
        ...patch.replaceOutputFluids,
      ];
    }
    if (patch.fluidOutputAmounts) {
      updated.outputs = applyFluidOutputAmounts(updated.outputs, patch.fluidOutputAmounts);
    }
    if (patch.circuitConfiguration !== undefined) {
      const circIdx = updated.inputs.findIndex((f) => f.itemId === 'gtceu:programmed_circuit');
      if (circIdx >= 0) {
        updated.inputs[circIdx] = {
          ...updated.inputs[circIdx],
          amount: patch.circuitConfiguration,
        };
      } else {
        updated.inputs.push({
          itemId: 'gtceu:programmed_circuit',
          amount: patch.circuitConfiguration,
        });
      }
    }

    const targetId = patch.newId ?? patch.recipeId;
    if (targetId !== patch.recipeId) {
      store.delete(patch.recipeId);
      updated.id = targetId;
    }

    store.set(updated);
    applied++;
  }

  return applied;
}
