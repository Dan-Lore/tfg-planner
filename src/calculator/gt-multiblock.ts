/** GTCEu multiblock machine IDs (recipe type → structure uses energy hatches). */
export const GT_MULTIBLOCK_IDS = new Set([
  'gtceu:electric_blast_furnace',
  'gtceu:pyrolyse_oven',
  'gtceu:alloy_blast_smelter',
  'gtceu:distillation_tower',
  'gtceu:vacuum_freezer',
  'gtceu:large_chemical_reactor',
  'gtceu:cracker',
  'gtceu:multi_smelter',
  'gtceu:assembly_line',
  'gtceu:fluid_solidifier',
  'gtceu:large_boiler',
  'gtceu:steam_grinder',
  'gtceu:steam_oven',
  'gtceu:primitive_blast_furnace',
  'gtceu:coke_oven',
  'gtceu:greenhouse',
  'gtceu:hydroponics_facility',
  'gtceu:coal_liquefaction_tower',
  'gt:electric_blast_furnace',
  'gt:pyrolyse_oven',
]);

export function isMultiblockMachineId(machineId: string): boolean {
  return GT_MULTIBLOCK_IDS.has(machineId);
}
