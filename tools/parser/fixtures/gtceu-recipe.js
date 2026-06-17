// Fixture: gtceu chemical_bath from gregtech/recipes.js
const registerGTCEURecipes = (event) => {
  event.recipes.gtceu.chemical_bath('tfg:magnesium_diboride_cool_down')
    .itemInputs('gtceu:hot_magnesium_diboride_ingot')
    .inputFluids(Fluid.of('minecraft:water', 100))
    .itemOutputs('gtceu:magnesium_diboride_ingot')
    .duration(400)
    .EUt(120);

  event.recipes.gtceu.mixer('tfg:uranium_triplatinum')
    .itemInputs(Item.of('gtceu:uranium_dust', 1), Item.of('gtceu:platinum_dust', 3))
    .inputFluids(Fluid.of('gtceu:radon', 10))
    .itemOutputs(Item.of('gtceu:uranium_triplatinum_dust', 4))
    .duration(200)
    .EUt(GTValues.VA[GTValues.EV]);
};

registerGTCEURecipes({});
