// TFG Planner — export effective RecipeManager after full modpack load.
// Copied into kubejs/server_scripts/_tfg_planner_export.js during generate-tfg-snapshot only.

const EXPORT_FLAG = 'tfg_planner_snapshot_exported';

const GT_TIER_NAMES = [
  'ULV', 'LV', 'MV', 'HV', 'EV', 'IV', 'LuV', 'ZPM', 'UV', 'UHV', 'UEV', 'UIV', 'UXV', 'OpV', 'MAX',
];

const GT_VOLTAGE = [8, 32, 128, 512, 2048, 8192, 32768, 131072, 524288, 2097152, 8388608, 33554432, 134217728, 536870912, 2147483647];

function inferEnergyFromFlatEUt(euPerTick) {
  if (euPerTick <= 0) return undefined;
  for (let i = 0; i < GT_VOLTAGE.length; i++) {
    const voltage = GT_VOLTAGE[i];
    const amperage = euPerTick / voltage;
    const doubled = amperage * 2;
    if (amperage > 0 && amperage <= 64 && Math.abs(doubled - Math.round(doubled)) < 1e-6) {
      return {
        minVoltageTier: GT_TIER_NAMES[i],
        voltage,
        amperage,
      };
    }
  }
  return {
    minVoltageTier: 'LV',
    voltage: 32,
    amperage: euPerTick / 32,
  };
}

function serializeEnergy(recipe) {
  try {
    const eu = recipe.tickInputs?.eu?.[0]?.content;
    if (eu != null) return inferEnergyFromFlatEUt(Number(eu));
    const eut = recipe.getEUt?.();
    if (eut != null) return inferEnergyFromFlatEUt(Number(eut));
  } catch (_) {
    /* optional */
  }
  return undefined;
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
  const energy = serializeEnergy(recipe);

  const flat = {
    id,
    machineId,
    inputs,
    outputs,
    durationTicks,
    source: 'kubejs-export',
  };
  if (energy) flat.energy = energy;
  return flat;
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
