import type { VoltageTier } from '../../../src/data/types.js';

/**
 * Static native voltage tier for GT machines (recipe min tier / structure baseline).
 * Used when inferring EnergyStack from flat EU/t for multiblock recipes.
 */
export const GT_MACHINE_NATIVE_TIER: Record<string, VoltageTier> = {
  // Multiblocks
  'gtceu:electric_blast_furnace': 'MV',
  'gt:electric_blast_furnace': 'MV',
  'gtceu:pyrolyse_oven': 'MV',
  'gt:pyrolyse_oven': 'MV',
  'gtceu:alloy_blast_smelter': 'MV',
  'gtceu:distillation_tower': 'HV',
  'gtceu:vacuum_freezer': 'HV',
  'gtceu:large_chemical_reactor': 'MV',
  'gtceu:cracker': 'HV',
  'gtceu:multi_smelter': 'MV',
  'gtceu:assembly_line': 'EV',
  'gtceu:fluid_solidifier': 'MV',
  'gtceu:large_boiler': 'LV',
  'gtceu:steam_grinder': 'LV',
  'gtceu:steam_oven': 'LV',
  'gtceu:coke_oven': 'LV',
  'gtceu:greenhouse': 'LV',

  // Common singleblocks (LV baseline)
  'gtceu:compressor': 'LV',
  'gtceu:assembler': 'LV',
  'gtceu:macerator': 'LV',
  'gtceu:extractor': 'LV',
  'gtceu:wiremill': 'LV',
  'gtceu:lathe': 'LV',
  'gtceu:centrifuge': 'MV',
  'gtceu:mixer': 'LV',
  'gtceu:electric_furnace': 'LV',
  'gtceu:arc_furnace': 'LV',
  'gtceu:bender': 'LV',
  'gtceu:cutting_machine': 'LV',
  'gtceu:polarizer': 'LV',
  'gtceu:electrolyzer': 'LV',
  'gtceu:chemical_reactor': 'MV',
  'gtceu:distillery': 'LV',
  'gtceu:fluid_heater': 'LV',
  'gtceu:fermenter': 'LV',
  'gtceu:packer': 'LV',
  'gtceu:laser_engraver': 'LV',
  'gtceu:forming_press': 'LV',
  'gtceu:autoclave': 'MV',
};

export function nativeTierForMachine(machineId: string): VoltageTier | undefined {
  return GT_MACHINE_NATIVE_TIER[machineId];
}
