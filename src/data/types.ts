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
  /** GT integrated circuit configuration; not a consumed product flow. */
  circuitConfiguration?: number;
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

/** Shared header for monolithic (v1) and sharded (v2) pack data. */
export interface PackDataHeader {
  format: 'tfg-pack-data';
  formatVersion: 1 | 2;
  modpackVersion: string;
  dataVersion: number;
  generatedAt: string;
  machines: Machine[];
  items: ItemDef[];
  fluids: ItemDef[];
}

/** v1 monolithic pack (tests, in-memory merges). */
export interface PackData extends PackDataHeader {
  formatVersion: 1;
  recipes: Recipe[];
}

/** v2 meta file — machines/items/fluids without recipe bodies. */
export interface PackMeta extends PackDataHeader {
  formatVersion: 2;
}

export interface RecipeShardEntry {
  file: string;
  count: number;
}

export interface RecipeShardIndex {
  format: 'tfg-pack-recipe-index';
  formatVersion: 1;
  shards: Record<string, RecipeShardEntry>;
}

export interface RecipeFlowAttachRef {
  machineId: string;
  recipeId: string;
  portIndex: number;
}

export interface RecipeFlowAttachIndex {
  format: 'tfg-pack-flow-index';
  formatVersion: 1;
  byInputKey: Record<string, RecipeFlowAttachRef[]>;
  byOutputKey: Record<string, RecipeFlowAttachRef[]>;
}

/** Subset of pack data passed to solver / scheme check. */
export interface PackSlice {
  meta: PackMeta | PackData;
  recipes: Recipe[];
}

export interface PackManifestEntry {
  modpackVersion: string;
  dataVersion: number;
  path: string;
  /** Base URL for sharded recipe files (v2). */
  recipesRoot?: string;
  status: 'ready' | 'planned' | 'building' | 'deprecated';
}

export interface PackManifest {
  format: 'tfg-pack-manifest';
  formatVersion: 1;
  packs: PackManifestEntry[];
}
