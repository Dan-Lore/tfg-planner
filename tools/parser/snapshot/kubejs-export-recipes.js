// priority: 10000
// TFG Planner — export effective RecipeManager after full modpack load.
// Rhino-safe: no optional chaining, nullish coalescing, or object spread.

var TFG_BATCH_SIZE = 1500;
var TFG_MIN_RECIPES = 6000;
// JsonIO.write accepts JsonObject only — wrap arrays as { recipes } / { chunks }.
var TFG_EXPORT_DIR = 'kubejs/config/tfg-planner-recipe-snapshot';
var TFG_MANIFEST = TFG_EXPORT_DIR + '/manifest.json';

console.info('[TFG Planner] Export script loaded');

function mergeRecipeEntry(id, gtJson) {
  var entry = { id: String(id) };
  for (var key in gtJson) {
    if (Object.prototype.hasOwnProperty.call(gtJson, key)) {
      entry[key] = gtJson[key];
    }
  }
  return entry;
}

function isRelevantRecipeType(type) {
  if (!type) return false;
  var t = String(type);
  return t.indexOf('gtceu:') === 0 || t.indexOf('tfg:') === 0;
}

function serializeKubeRecipe(recipe) {
  try {
    if (typeof recipe.serialize === 'function') {
      recipe.serialize();
    }
    var jsonRaw = recipe.json;
    if (jsonRaw == null) return null;
    var parsed;
    if (typeof jsonRaw === 'string') {
      parsed = JSON.parse(jsonRaw);
    } else if (typeof jsonRaw.toString === 'function') {
      parsed = JSON.parse(jsonRaw.toString());
    } else if (typeof jsonRaw === 'object' && jsonRaw.type) {
      parsed = jsonRaw;
    }
    if (!parsed || !parsed.type || !isRelevantRecipeType(parsed.type)) return null;
    var recipeId =
      typeof recipe.getId === 'function' ? String(recipe.getId()) : String(recipe.id);
    return mergeRecipeEntry(recipeId, parsed);
  } catch (e) {
    return null;
  }
}

function collectFromMatches(matches) {
  var collected = [];
  var seen = {};
  if (matches == null) return collected;

  if (typeof matches.forEach === 'function') {
    matches.forEach(function (recipe) {
      var entry = serializeKubeRecipe(recipe);
      if (!entry || seen[entry.id]) return;
      seen[entry.id] = true;
      collected.push(entry);
    });
    return collected;
  }

  var len = matches.length;
  if (typeof matches.size === 'function') {
    len = matches.size();
  }
  for (var i = 0; i < len; i++) {
    var recipe = typeof matches.get === 'function' ? matches.get(i) : matches[i];
    var entry = serializeKubeRecipe(recipe);
    if (!entry || seen[entry.id]) continue;
    seen[entry.id] = true;
    collected.push(entry);
  }
  return collected;
}

function collectFromRecipeEvent(recipeEvent) {
  if (recipeEvent == null) return [];

  var collected = collectFromMatches(recipeEvent.findRecipes({}));
  if (collected.length > 0) return collected;

  var seen = {};
  collected = [];
  function pushRecipe(recipe) {
    var entry = serializeKubeRecipe(recipe);
    if (!entry || seen[entry.id]) return;
    seen[entry.id] = true;
    collected.push(entry);
  }

  var origIt = recipeEvent.originalRecipes.values().iterator();
  while (origIt.hasNext()) {
    pushRecipe(origIt.next());
  }
  var addedIt = recipeEvent.addedRecipes.iterator();
  while (addedIt.hasNext()) {
    pushRecipe(addedIt.next());
  }
  return collected;
}

function manifestExists() {
  try {
    var manifest = JsonIO.read(TFG_MANIFEST);
    if (manifest == null) return false;
    if (manifest.chunks != null) return true;
    if (typeof manifest.length === 'number' && manifest.length > 0) return true;
    return false;
  } catch (e) {
    return false;
  }
}

function writeSnapshot(collected, phase) {
  console.info('[TFG Planner] Collected ' + collected.length + ' GT JSON recipes (' + phase + ')');
  if (collected.length < TFG_MIN_RECIPES) {
    console.info('[TFG Planner] Skip export: need >= ' + TFG_MIN_RECIPES + ' recipes');
    return false;
  }

  var chunkRelPaths = [];
  try {
    for (var b = 0; b < collected.length; b += TFG_BATCH_SIZE) {
      var chunk = [];
      var end = b + TFG_BATCH_SIZE;
      if (end > collected.length) end = collected.length;
      for (var j = b; j < end; j++) {
        chunk.push(collected[j]);
      }
      var chunkRel = TFG_EXPORT_DIR + '/recipes-' + chunkRelPaths.length + '.json';
      JsonIO.write(chunkRel, { recipes: chunk });
      chunkRelPaths.push(chunkRel);
    }
    JsonIO.write(TFG_MANIFEST, { chunks: chunkRelPaths });
    if (manifestExists()) {
      console.info(
        '[TFG Planner] Exported ' +
          collected.length +
          ' GT JSON recipes in ' +
          chunkRelPaths.length +
          ' chunks -> ' +
          TFG_EXPORT_DIR,
      );
      return true;
    }
    console.error('[TFG Planner] Export verify failed: manifest missing after write');
    return false;
  } catch (e) {
    console.error('[TFG Planner] Export write failed: ' + e);
    return false;
  }
}

// Collect during recipe reload (JsonIO cannot write during this phase).
ServerEvents.recipes(function (event) {
  global.tfgPlannerRecipeEvent = event;
  global.tfgPlannerRecipes = collectFromRecipeEvent(event);
  console.info(
    '[TFG Planner] Stashed ' + global.tfgPlannerRecipes.length + ' GT JSON recipes for export',
  );
});

// Write after server is up; TFG /reload finishes ~20s before tick 500.
ServerEvents.loaded(function (event) {
  if (manifestExists()) {
    console.info('[TFG Planner] Server loaded — manifest already present');
    return;
  }
  console.info('[TFG Planner] Server loaded — scheduling export after reload');
  event.server.scheduleInTicks(500, function () {
    if (manifestExists()) return;
    var collected = global.tfgPlannerRecipes;
    if (collected == null && global.tfgPlannerRecipeEvent != null) {
      collected = collectFromRecipeEvent(global.tfgPlannerRecipeEvent);
    }
    if (collected == null) {
      console.info('[TFG Planner] No stashed recipes available (loaded+500t)');
      return;
    }
    console.info('[TFG Planner] Running export (loaded+500t)');
    writeSnapshot(collected, 'loaded+500t');
  });
});
