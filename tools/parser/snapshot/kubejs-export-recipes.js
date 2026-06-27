// priority: 10000
// TFG Planner — export full RecipeManager after modpack load (Rhino-safe).

var TFG_BATCH_SIZE = 1500;
var TFG_MIN_RECIPES = 6000;
var TFG_EXPORT_DIR = 'kubejs/config/tfg-planner-recipe-snapshot';
var TFG_MANIFEST = TFG_EXPORT_DIR + '/manifest.json';
var TFG_EXPORT_DELAYS = [500, 800, 1200];
var TFG_MIN_GREENHOUSE = 1000;
var TFG_MIN_LIQUEFACTION = 10;
var TFG_MIN_TFG_IDS = 3000;

var TFG_REQUIRED_MARKERS = [
  'tfg:tfc_wood_sapling_pine/1',
  'tfg:raw_aromatic_mix_charcoal_hydrogen',
  'tfg:aromatic_feedstock@lcr',
  'tfg:reformed_aromatic_feedstock@lcr',
  'tfg:reformate_gas_cracker',
  'gtceu:pyrolyse_oven/log_to_charcoal_byproducts',
  'gtceu:distillation_tower/distill_wood_tar',
];

console.info('[TFG Planner] Export script loaded (RecipeManager v2)');

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

function bumpStat(stats, bucket, type) {
  stats[bucket]++;
  if (type) {
    if (!stats.byType[bucket]) stats.byType[bucket] = {};
    var key = String(type);
    stats.byType[bucket][key] = (stats.byType[bucket][key] || 0) + 1;
  }
}

function newStats() {
  return { primary: 0, fallback: 0, dropped: 0, byType: {} };
}

function jsonObjectToPlain(jsonRaw) {
  if (jsonRaw == null) return null;
  if (typeof jsonRaw === 'string') {
    return JSON.parse(jsonRaw);
  }
  if (typeof jsonRaw === 'object' && jsonRaw.type) {
    return jsonRaw;
  }
  if (typeof jsonRaw.toString === 'function') {
    var text = String(jsonRaw.toString());
    if (text.length > 0 && text.charAt(0) === '{') {
      return JSON.parse(text);
    }
  }
  try {
    var Gson = Java.loadClass('com.google.gson.Gson');
    var gson = new Gson();
    return JSON.parse(gson.toJson(jsonRaw));
  } catch (e1) {
    return null;
  }
}

function resourceLocationString(loc) {
  if (loc == null) return null;
  try {
    if (typeof loc.getNamespace === 'function' && typeof loc.getPath === 'function') {
      return String(loc.getNamespace()) + ':' + String(loc.getPath());
    }
    if (typeof loc.toString === 'function') {
      var text = String(loc.toString());
      if (text.indexOf(':') >= 0 && text.indexOf(' ') < 0) return text;
    }
  } catch (e1) {
    /* fall through */
  }
  return String(loc);
}

function recipeIdFromObject(recipe) {
  if (recipe == null) return null;
  if (recipe.id != null) {
    var direct = resourceLocationString(recipe.id);
    if (direct && direct.indexOf(':') >= 0) return direct;
  }
  if (typeof recipe.getId === 'function') {
    return resourceLocationString(recipe.getId());
  }
  return null;
}

/** Rhino: Java.loadClass returns the Class — use .isInstance, not .class.isInstance */
function isJavaInstance(obj, clazz) {
  if (obj == null || clazz == null) return false;
  try {
    if (clazz.isInstance(obj)) return true;
  } catch (e1) {
    /* fall through */
  }
  try {
    return String(obj.getClass().getName()) === String(clazz.getName());
  } catch (e2) {
    return false;
  }
}

function looksLikeGtRecipe(recipe) {
  if (recipe == null) return false;
  try {
    return String(recipe.getClass().getName()) === 'com.gregtechceu.gtceu.api.recipe.GTRecipe';
  } catch (e) {
    return false;
  }
}

function serializeGtRecipeJava(gtRecipe, stats) {
  try {
    var GTRecipeSerializer = Java.loadClass('com.gregtechceu.gtceu.api.recipe.GTRecipeSerializer');
    var JsonOps = Java.loadClass('com.mojang.serialization.JsonOps');
    var Gson = Java.loadClass('com.google.gson.Gson');
    var gson = new Gson();

    var encodeResult = GTRecipeSerializer.CODEC.encodeStart(JsonOps.INSTANCE, gtRecipe);
    var optional = encodeResult.result();
    var jsonElement = null;
    if (optional != null && optional.isPresent()) {
      jsonElement = optional.get();
    } else {
      var partial = encodeResult.resultOrPartial(function () {});
      if (partial != null && partial.isPresent()) {
        jsonElement = partial.get();
      }
    }
    if (jsonElement == null) return null;

    var parsed = JSON.parse(gson.toJson(jsonElement));
    if (!parsed || typeof parsed !== 'object') return null;

    if (!parsed.type) {
      var rt = gtRecipe.getType();
      if (rt != null && rt.registryName != null) {
        parsed.type = String(rt.registryName);
      }
    }
    var recipeId = recipeIdFromObject(gtRecipe);
    if (!recipeId) return null;

    bumpStat(stats, 'fallback', parsed.type);
    return mergeRecipeEntry(recipeId, parsed);
  } catch (e) {
    return null;
  }
}

function serializeKubeRecipe(recipe, stats) {
  if (recipe == null) return null;
  var recipeId = recipeIdFromObject(recipe);
  if (!recipeId) return null;

  try {
    if (typeof recipe.serialize === 'function') {
      recipe.serialize();
    }
    var jsonRaw = recipe.json;
    if (jsonRaw != null) {
      var parsed = jsonObjectToPlain(jsonRaw);
      if (parsed && parsed.type && isRelevantRecipeType(parsed.type)) {
        bumpStat(stats, 'primary', parsed.type);
        return mergeRecipeEntry(recipeId, parsed);
      }
    }
  } catch (e) {
    /* fall through to Java GTRecipe */
  }

  try {
    var GTRecipe = Java.loadClass('com.gregtechceu.gtceu.api.recipe.GTRecipe');
    if (isJavaInstance(recipe, GTRecipe) || looksLikeGtRecipe(recipe)) {
      return serializeGtRecipeJava(recipe, stats);
    }
  } catch (e2) {
    /* not GTRecipe */
  }

  if (recipe.gtRecipe != null) {
    var fromField = serializeGtRecipeJava(recipe.gtRecipe, stats);
    if (fromField) return fromField;
  }

  bumpStat(stats, 'dropped', 'unknown');
  return null;
}

function forEachRecipe(recipe, pushFn) {
  if (recipe == null) return;
  pushFn(recipe);
}

function forEachMatchCollection(matches, pushFn) {
  if (matches == null) return;
  if (typeof matches.forEach === 'function') {
    matches.forEach(function (recipe) {
      forEachRecipe(recipe, pushFn);
    });
    return;
  }
  var len = matches.length;
  if (typeof matches.size === 'function') {
    len = matches.size();
  }
  for (var i = 0; i < len; i++) {
    var recipe = typeof matches.get === 'function' ? matches.get(i) : matches[i];
    forEachRecipe(recipe, pushFn);
  }
}

function mergeFromRecipeEvent(recipeEvent, seen, collected, stats) {
  if (recipeEvent == null) return;
  function pushRecipe(recipe) {
    var entry = serializeKubeRecipe(recipe, stats);
    if (!entry || seen[entry.id]) return;
    seen[entry.id] = true;
    collected.push(entry);
  }
  forEachMatchCollection(recipeEvent.findRecipes({}), pushRecipe);
  try {
    var origIt = recipeEvent.originalRecipes.values().iterator();
    while (origIt.hasNext()) {
      pushRecipe(origIt.next());
    }
  } catch (e1) {
    /* optional */
  }
  try {
    var addedIt = recipeEvent.addedRecipes.iterator();
    while (addedIt.hasNext()) {
      pushRecipe(addedIt.next());
    }
  } catch (e2) {
    /* optional */
  }
}

function collectFromServerRecipeManager(server, seen, collected, stats) {
  if (server == null) return;
  var scanned = 0;
  var added = 0;
  try {
    var manager = server.getRecipeManager();
    var all = manager.getRecipes();
    var iter = all.iterator();
    var GTRecipe = Java.loadClass('com.gregtechceu.gtceu.api.recipe.GTRecipe');
    while (iter.hasNext()) {
      var recipe = iter.next();
      scanned++;
      if (!isJavaInstance(recipe, GTRecipe) && !looksLikeGtRecipe(recipe)) continue;
      var entry = serializeGtRecipeJava(recipe, stats);
      if (!entry || seen[entry.id]) continue;
      seen[entry.id] = true;
      collected.push(entry);
      added++;
    }
    console.info(
      '[TFG Planner] RecipeManager: scanned=' + scanned + ' gtAdded=' + added,
    );
  } catch (e) {
    console.error('[TFG Planner] RecipeManager collect failed: ' + e);
  }
}

function collectFromGtRegistries(seen, collected, stats) {
  var added = 0;
  try {
    var GTRegistries = Java.loadClass('com.gregtechceu.gtceu.api.registry.GTRegistries');
    var registry = GTRegistries.RECIPE_TYPES;
    var values = null;
    if (typeof registry.getValues === 'function') {
      values = registry.getValues();
    } else if (typeof registry.values === 'function') {
      values = registry.values();
    } else if (typeof registry.iterator === 'function') {
      values = registry;
    }
    if (values == null) {
      console.info('[TFG Planner] GTRegistries: no recipe type iterator');
      return;
    }
    var typeIter = typeof values.iterator === 'function' ? values.iterator() : values;
    while (typeIter.hasNext()) {
      var recipeType = typeIter.next();
      if (recipeType == null) continue;
      var categories = recipeType.getCategories();
      if (categories == null) continue;
      var catIter = categories.iterator();
      while (catIter.hasNext()) {
        var category = catIter.next();
        var recipeSet = recipeType.getRecipesInCategory(category);
        if (recipeSet == null) continue;
        var rIter = recipeSet.iterator();
        while (rIter.hasNext()) {
          var gtRecipe = rIter.next();
          var entry = serializeGtRecipeJava(gtRecipe, stats);
          if (!entry || seen[entry.id]) continue;
          seen[entry.id] = true;
          collected.push(entry);
          added++;
        }
      }
    }
    console.info('[TFG Planner] GTRegistries: added=' + added);
  } catch (e) {
    console.error('[TFG Planner] GTRegistries collect failed: ' + e);
  }
}

function countTypeEntries(collected) {
  var typeCounts = {};
  for (var i = 0; i < collected.length; i++) {
    var entry = collected[i];
    var type = entry.type ? String(entry.type) : 'unknown';
    typeCounts[type] = (typeCounts[type] || 0) + 1;
  }
  return typeCounts;
}

function countTfgIds(collected) {
  var count = 0;
  for (var i = 0; i < collected.length; i++) {
    if (String(collected[i].id).indexOf('tfg:') === 0) count++;
  }
  return count;
}

var TFG_MARKER_ALIASES = {
  'gtceu:pyrolyse_oven/log_to_charcoal_byproducts': ['tfg:pyrolyse_oven/log_to_charcoal_byproducts'],
  'gtceu:distillation_tower/distill_wood_tar': [
    'gtceu:distill_wood_tar',
    'tfg:distillation_tower/distill_wood_tar',
  ],
  'tfg:tfc_wood_sapling_pine/1': ['tfg:greenhouse/8x_tfc_wood_sapling_pine/1'],
  'tfg:raw_aromatic_mix_charcoal_hydrogen': [
    'tfg:coal_liquefaction_tower/raw_aromatic_mix_charcoal_hydrogen',
  ],
  'tfg:aromatic_feedstock@lcr': ['tfg:large_chemical_reactor/aromatic_feedstock'],
  'tfg:reformed_aromatic_feedstock@lcr': ['tfg:large_chemical_reactor/reformed_aromatic_feedstock'],
  'tfg:reformate_gas_cracker': ['tfg:cracker/reformate_gas_cracker'],
};

function markerPresentInIds(ids, marker) {
  if (ids[marker]) return true;
  var alts = TFG_MARKER_ALIASES[marker];
  if (alts == null) return false;
  for (var i = 0; i < alts.length; i++) {
    if (ids[alts[i]]) return true;
  }
  return false;
}

function markerIdsPresent(collected) {
  var ids = {};
  for (var i = 0; i < collected.length; i++) {
    ids[collected[i].id] = true;
  }
  var present = [];
  for (var m = 0; m < TFG_REQUIRED_MARKERS.length; m++) {
    if (markerPresentInIds(ids, TFG_REQUIRED_MARKERS[m])) {
      present.push(TFG_REQUIRED_MARKERS[m]);
    }
  }
  return present;
}

function exportQualityOk(collected) {
  var typeCounts = countTypeEntries(collected);
  var greenhouse = typeCounts['gtceu:greenhouse'] || 0;
  var liquefaction = typeCounts['gtceu:coal_liquefaction_tower'] || 0;
  var tfgIds = countTfgIds(collected);
  var markers = markerIdsPresent(collected);
  console.info(
    '[TFG Planner] Quality: greenhouse=' +
      greenhouse +
      ' liquefaction=' +
      liquefaction +
      ' tfgIds=' +
      tfgIds +
      ' markers=' +
      markers.length +
      '/' +
      TFG_REQUIRED_MARKERS.length,
  );
  if (markers.length < TFG_REQUIRED_MARKERS.length) {
    var missing = [];
    var ids = {};
    for (var i = 0; i < collected.length; i++) ids[collected[i].id] = true;
    for (var m = 0; m < TFG_REQUIRED_MARKERS.length; m++) {
      if (!markerPresentInIds(ids, TFG_REQUIRED_MARKERS[m])) {
        missing.push(TFG_REQUIRED_MARKERS[m]);
      }
    }
    console.info('[TFG Planner] Missing markers: ' + missing.join(', '));
  }
  if (collected.length < TFG_MIN_RECIPES) return false;
  if (greenhouse < TFG_MIN_GREENHOUSE) return false;
  if (liquefaction < TFG_MIN_LIQUEFACTION) return false;
  if (tfgIds < TFG_MIN_TFG_IDS) return false;
  return true;
}

function collectAllRecipes(server) {
  var seen = {};
  var collected = [];
  var stats = newStats();

  collectFromServerRecipeManager(server, seen, collected, stats);
  collectFromGtRegistries(seen, collected, stats);
  mergeFromRecipeEvent(global.tfgPlannerRecipeEvent, seen, collected, stats);

  return {
    collected: collected,
    stats: stats,
    typeCounts: countTypeEntries(collected),
  };
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

function writeSnapshot(result, phase) {
  var collected = result.collected;
  var stats = result.stats;
  var typeCounts = result.typeCounts;

  console.info(
    '[TFG Planner] Collected ' +
      collected.length +
      ' recipes (' +
      phase +
      ') primary=' +
      stats.primary +
      ' fallback=' +
      stats.fallback +
      ' dropped=' +
      stats.dropped,
  );

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
    JsonIO.write(TFG_MANIFEST, {
      schemaVersion: 2,
      chunks: chunkRelPaths,
      recipeCount: collected.length,
      serializeStats: {
        primary: stats.primary,
        fallback: stats.fallback,
        dropped: stats.dropped,
      },
      typeCounts: typeCounts,
      markerRecipeIds: markerIdsPresent(collected),
      exportedAt: String(new Date().getTime()),
    });
    if (manifestExists()) {
      console.info(
        '[TFG Planner] Exported ' +
          collected.length +
          ' recipes in ' +
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

function scheduleExportAttempt(server, delayIndex) {
  if (manifestExists()) return;
  var delay = TFG_EXPORT_DELAYS[delayIndex];
  if (delay == null) {
    console.error('[TFG Planner] Export failed after all retries');
    return;
  }
  server.scheduleInTicks(delay, function () {
    if (manifestExists()) return;
    var phase = 'loaded+' + delay + 't';
    console.info('[TFG Planner] Running export (' + phase + ')');
    var result = collectAllRecipes(server);
    if (!exportQualityOk(result.collected)) {
      console.info('[TFG Planner] Export quality gate not met — retry ' + (delayIndex + 1));
      scheduleExportAttempt(server, delayIndex + 1);
      return;
    }
    writeSnapshot(result, phase);
  });
}

ServerEvents.recipes(function (event) {
  global.tfgPlannerRecipeEvent = event;
  console.info('[TFG Planner] Recipes event captured (export deferred until server stable)');
});

ServerEvents.loaded(function (event) {
  if (manifestExists()) {
    console.info('[TFG Planner] Server loaded — manifest already present');
    return;
  }
  console.info('[TFG Planner] Server loaded — scheduling RecipeManager export');
  scheduleExportAttempt(event.server, 0);
});
