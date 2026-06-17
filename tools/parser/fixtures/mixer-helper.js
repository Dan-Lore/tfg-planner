const register = (event) => {
  generateMixerRecipe(
    event,
    ['2x #tfg:stone_dusts'],
    ['gtceu:lubricant 20', '#tfg:clean_water 4000'],
    [],
    null,
    Fluid.of('gtceu:drilling_fluid', 5000),
    40,
    16,
    64,
    'drilling_fluid',
  );
};

register({});
