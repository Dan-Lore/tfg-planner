// priority: 0
"use strict";

function registerSpaceRecipes(event) {
  const allowedCombustibleDims = [
    { dimension: "minecraft:the_nether", type: "dimension" },
    { dimension: "minecraft:overworld", type: "dimension" },
  ];

  event.findRecipes({ type: "gtceu:large_boiler" }).forEach(recipe => {
    recipe.json.add("recipeConditions", allowedCombustibleDims);
  });
}
