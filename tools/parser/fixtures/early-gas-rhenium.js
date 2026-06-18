function registerTFGEarlyGasRecipes(event) {
  event.recipes.gtceu.chemical_reactor('tfg:reformed_aromatic_feedstock')
    .chancedInput(Item.of('gtceu:tiny_rhenium_dust'), 1000, 0)
    .inputFluids(Fluid.of('tfg:aromatic_feedstock', 2000))
    .outputFluids(Fluid.of('tfg:reformed_aromatic_feedstock', 2000))
    .duration(20 * 18)
    .EUt(120);

  event.recipes.gtceu.electrolyzer('tfg:cracker_off_gas_recycling')
    .inputFluids(Fluid.of('tfg:cracker_off_gas', 1000))
    .outputFluids(Fluid.of('gtceu:carbon_dioxide', 500), Fluid.of('gtceu:hydrogen', 500))
    .chancedOutput(Item.of('gtceu:tiny_rhenium_dust'), 1000, 0)
    .duration(20 * 4.5)
    .EUt(480);
}
