const removeGTCEURecipes = (event) => {
  event.remove({ id: 'gtceu:centrifuge/uranium_238_separation' });
  event.remove({ id: 'gtceu:shaped/mv_chemical_bath' });
  event.remove({ mod: 'gtceu', type: 'minecraft:crafting_shaped' });
};

removeGTCEURecipes({});
