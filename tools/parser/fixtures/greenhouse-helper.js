function registerTFGGreenhouseRecipes(event) {
  generateGreenHouseRecipe(
    event,
    null,
    '8x minecraft:bamboo',
    ['64x minecraft:bamboo', '8x minecraft:bamboo'],
    1,
    1,
  );

  generateCropGreenHouseRecipe(
    event,
    null,
    'tfc:plant/wheat',
    'tfc:food/wheat',
    null,
    1,
  );
}
