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

export interface EnergyCost {
  euPerTick: number;
  voltageTier?: string;
}

export interface Recipe {
  id: string;
  machineId: string;
  inputs: Flow[];
  outputs: Flow[];
  durationTicks: number;
  energy?: EnergyCost;
}

export interface Machine {
  id: string;
  names: LocalizedName;
  category: string;
  recipeIds: string[];
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
