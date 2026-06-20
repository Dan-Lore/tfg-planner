export interface LocalizedName {
  ru: string;
  en: string;
}

export interface Flow {
  itemId?: string;
  fluidId?: string;
  amount: number;
  /** GT chanced I/O weight; 10000 = guaranteed. Omitted when 100%. */
  chance?: number;
}

export type VoltageTier =
  | 'ULV'
  | 'LV'
  | 'MV'
  | 'HV'
  | 'EV'
  | 'IV'
  | 'LuV'
  | 'ZPM'
  | 'UV'
  | 'UHV'
  | 'UEV'
  | 'UIV'
  | 'UXV'
  | 'OpV'
  | 'MAX';

/** Base energy at recipe minimum voltage tier: EU/t = voltage × amperage. */
export interface RecipeEnergy {
  minVoltageTier: VoltageTier;
  voltage: number;
  amperage: number;
}

export interface Recipe {
  id: string;
  machineId: string;
  inputs: Flow[];
  outputs: Flow[];
  durationTicks: number;
  energy?: RecipeEnergy;
}

export interface Machine {
  id: string;
  names: LocalizedName;
  category: string;
  recipeIds: string[];
  /** Omitted for singleblock GT machines. */
  kind?: 'singleblock' | 'multiblock';
  /** GT native voltage tier of the machine structure (multiblock baseline). */
  nativeTier?: VoltageTier;
}

export interface ItemDef {
  id: string;
  names: LocalizedName;
}

export interface PackData {
  format: 'tfg-pack-data';
  formatVersion: 1;
  modpackVersion: string;
  dataVersion: number;
  generatedAt: string;
  machines: Machine[];
  recipes: Recipe[];
  items: ItemDef[];
  fluids: ItemDef[];
}

export interface PackManifestEntry {
  modpackVersion: string;
  dataVersion: number;
  path: string;
  status: 'ready' | 'planned' | 'building' | 'deprecated';
}

export interface PackManifest {
  format: 'tfg-pack-manifest';
  formatVersion: 1;
  packs: PackManifestEntry[];
}
