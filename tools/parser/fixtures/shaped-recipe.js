const register = (event) => {
  event.shaped('gtceu:mv_chemical_bath', [
    'ABC',
    'DEA',
    'FGF',
  ], {
    A: 'gtceu:mv_conveyor_module',
    B: '#forge:glass',
    C: 'gtceu:copper_single_cable',
    D: 'gtceu:mv_electric_pump',
    E: 'gtceu:polyethylene_normal_fluid_pipe',
    F: '#gtceu:circuits/mv',
    G: 'gtceu:mv_machine_hull',
  }).id('tfg:shaped/mv_chemical_bath');

  event.smelting('minecraft:copper_ingot', '#forge:ingots/annealed_copper')
    .id('tfg:revert_annealed_copper_ingot');

  event.shaped('4x create:track_signal', ['A'], { A: 'minecraft:redstone' })
    .id('tfg:test/4x_output');
};

register({});
