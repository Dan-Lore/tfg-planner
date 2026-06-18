function registerTFGEarlyGasRecipes(event) {
  function modifyRecipes(recipeIds, duration) {
    recipeIds.forEach(id => {
      global.modifyRecipe(event, id, {
        newId: "tfg:" + linuxUnfucker(id),
        duration: duration
      })
    })
  }

  modifyRecipes([
    "gtceu:pyrolyse_oven/log_to_creosote",
    "gtceu:pyrolyse_oven/log_to_wood_tar"
  ], 20 * 64)

  global.modifyRecipe(event, "gtceu:alloy_blast_smelter/red_alloy", {
    newId: "tfg:red_alloy",
    fluidOutputs: { "gtceu:red_alloy": 720 }
  });
}
