/** Internal parser types (before normalization to tfg-pack-data). */

export interface FlowOp {
  itemId?: string;
  fluidId?: string;
  amount: number;
}

export interface EnergyOp {
  euPerTick: number;
  voltageTier?: string;
}

export interface RecipeOp {
  id: string;
  machineId: string;
  inputs: FlowOp[];
  outputs: FlowOp[];
  durationTicks: number;
  energy?: EnergyOp;
  source: string;
}

export interface ReplaceOp {
  selector: { id?: string; mod?: string; output?: string };
  oldInput: string;
  newInput: string;
  source: string;
}

export interface ParseWarning {
  file: string;
  reason: string;
  line?: number;
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
  stats: {
    substrateRecipes: number;
    datapackRecipes: number;
    kubejsRecipes: number;
    removes: number;
    replaces: number;
    finalRecipes: number;
    machines: number;
    items: number;
    fluids: number;
    recipesWithEnergy: number;
    filesScanned: number;
    filesUnparsed: number;
    goldenMatched?: number;
    goldenMismatched?: number;
    goldenMissing?: number;
  };
  warnings: ParseWarning[];
  unparsedFiles: string[];
  smokeResults?: { id: string; ok: boolean; reason?: string }[];
  goldenDiff?: { id: string; field: string; expected: unknown; actual: unknown }[];
}
