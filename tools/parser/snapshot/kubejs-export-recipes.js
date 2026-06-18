// TFG Planner — export effective RecipeManager after full modpack load.
// Copied into kubejs/server_scripts/_tfg_planner_export.js during generate-tfg-snapshot only.

const EXPORT_FLAG = 'tfg_planner_snapshot_exported';
const EXPORT_REL = 'tfg-planner-recipe-snapshot/recipes.json';

function flowFromIngredient(ingredient, amount) {
  if (!ingredient) return null;
  const id = ingredient.id ?? ingredient.item ?? ingredient.fluid;
  if (!id) return null;
  const str = String(id);
  if (str.includes(':fluid') || ingredient.fluid) {
    return { fluidId: str.replace(/:fluid$/, ''), amount: amount ?? 1 };
  }
  if (str.startsWith('#')) return { itemId: str, amount: amount ?? 1 };
  return { itemId: str, amount: amount ?? 1 };
}

function serializeRecipe(recipe) {
  const id = String(recipe.id);
  const type = String(recipe.type);
  const machineId = type.startsWith('gtceu:')
    ? `gtceu:${type.replace(/^gtceu:/, '').split('/')[0]}`
    : type;

  const inputs = [];
  const outputs = [];

  try {
    const inItems = recipe.ingredients ?? recipe.getIngredients?.() ?? [];
    for (const ing of inItems) {
      if (!ing) continue;
      const stacks = ing.stacks ?? (ing.getStacks ? ing.getStacks() : [ing]);
      for (const stack of stacks) {
        const itemId = stack.id ?? stack.item?.id ?? stack.getId?.();
        const count = stack.count ?? stack.amount ?? 1;
        if (itemId) inputs.push({ itemId: String(itemId), amount: count });
      }
    }
  } catch (_) {
    /* non-item recipes */
  }

  try {
    const result = recipe.result ?? recipe.getResultItem?.();
    if (result) {
      const itemId = result.id ?? result.item?.id ?? result.getId?.();
      const count = result.count ?? result.amount ?? 1;
      if (itemId) outputs.push({ itemId: String(itemId), amount: count });
    }
  } catch (_) {
    /* fluid / multi-output */
  }

  const durationTicks = recipe.cookingTime ?? recipe.processingTime ?? 20;

  return {
    id,
    machineId,
    inputs,
    outputs,
    durationTicks,
    source: 'kubejs-export',
  };
}

ServerEvents.loaded((event) => {
  if (event.server.persistentData.getBoolean(EXPORT_FLAG)) return;
  event.server.persistentData.putBoolean(EXPORT_FLAG, true);

  const recipes = [];
  const manager = event.server.recipeManager;

  manager.getRecipes().forEach((recipe) => {
    try {
      const flat = serializeRecipe(recipe);
      if (flat.inputs.length > 0 || flat.outputs.length > 0) {
        recipes.push(flat);
      }
    } catch (e) {
      console.warn(`[TFG Planner] skip recipe ${recipe.id}: ${e}`);
    }
  });

  const dir = Utils.getGameDirectory().resolve('logs').resolve('tfg-planner-recipe-snapshot');
  dir.toFile().mkdirs();
  const out = dir.resolve('recipes.json');
  JsonIO.write(out.toString(), recipes);
  console.info(`[TFG Planner] Exported ${recipes.length} recipes → ${out}`);
  event.server.halt(true);
});
