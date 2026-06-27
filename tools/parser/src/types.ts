/** Internal parser types (before normalization to tfg-pack-data). */

export interface FlowOp {
  itemId?: string;
  fluidId?: string;
  amount: number;
  /** GT chanced I/O weight (10000 = guaranteed). */
  chance?: number;
}

import type { EnergyStack } from './energy-parse.js';

export type EnergyOp = EnergyStack;

export interface RecipeOp {
  id: string;
  machineId: string;
  inputs: FlowOp[];
  outputs: FlowOp[];
  durationTicks: number;
  energy?: EnergyOp;
  /** GT integrated circuit configuration; not a consumed product flow. */
  circuitConfiguration?: number;
  source: string;
}

export interface ReplaceOp {
  selector: { id?: string; mod?: string; output?: string };
  oldInput: string;
  newInput: string;
  source: string;
}

/** Patch applied via global.modifyRecipe(event, id, { ... }). */
export interface RecipePatch {
  recipeId: string;
  newId?: string;
  durationTicks?: number;
  replaceItemInputs?: FlowOp[];
  replaceItemOutputs?: FlowOp[];
  replaceInputFluids?: FlowOp[];
  replaceOutputFluids?: FlowOp[];
  fluidOutputAmounts?: Record<string, number>;
  /** Adds or updates integrated circuit configuration on machine recipes. */
  circuitConfiguration?: number;
  source: string;
  line?: number;
}

export type WarningKind =
  | 'forEach'
  | 'findRecipes'
  | 'modifyResult'
  | 'modifyRecipe'
  | 'substrate'
  | 'other';

export interface ParseWarning {
  file: string;
  reason: string;
  line?: number;
  kind?: WarningKind;
}

export interface FileParseStats {
  file: string;
  recipes: number;
  removes: number;
  replaces: number;
  unparsed: number;
}

export interface ModIndexEntry {
  slug: string;
  fileName: string;
  version: string;
  url: string;
}

export interface ModIndex {
  generatedAt: string;
  tag: string;
  mcVersion: string;
  mods: ModIndexEntry[];
}

export interface BuildReport {
  modpackVersion: string;
  tag: string;
  commitHint?: string;
  generatedAt: string;
  snapshotManifestOk?: boolean;
  stats: {
    snapshotRecipes: number;
    snapshotFiles: number;
    snapshotParsed: number;
    snapshotSkipped: number;
    snapshotSha256?: string;
    finalRecipes: number;
    machines: number;
    items: number;
    fluids: number;
    recipesWithEnergy: number;
    recipesWithChance?: number;
    recipesMissingOutputs?: number;
    recipesCircuitOnlyDropped?: number;
    goldenMatched?: number;
    goldenMismatched?: number;
    goldenMissing?: number;
  };
  warnings: ParseWarning[];
  warningsByKind?: Partial<Record<WarningKind, number>>;
  unparsedFiles: string[];
  smokeResults?: { id: string; ok: boolean; reason?: string }[];
  goldenDiff?: { id: string; field: string; expected: unknown; actual: unknown }[];
}
