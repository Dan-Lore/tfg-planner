import { readFileSync } from 'node:fs';
import type { FileParseStats, ParseWarning, RecipeOp, ReplaceOp } from '../types.js';
import { parseKubeJs } from './ast/parse.js';
import { findGtceuRecipeCalls } from './ast/extractors/gtceu.js';
import { findRemoves, type RemoveSelector } from './ast/extractors/remove.js';
import { findReplaces } from './ast/extractors/replace.js';
import { findCraftingRecipes } from './ast/extractors/shaped.js';
import { findMixerHelperCalls } from './ast/extractors/helpers.js';
import { findUnparsedPatterns } from './ast/extractors/tail.js';

export interface FileParseResult {
  recipes: RecipeOp[];
  removes: RemoveSelector[];
  replaces: ReplaceOp[];
  warnings: ParseWarning[];
  stats: FileParseStats;
  parseFailed: boolean;
}

export function parseKubeJsFile(filePath: string): FileParseResult {
  const source = readFileSync(filePath, 'utf-8');
  const ast = parseKubeJs(source, filePath);

  if (!ast) {
    return {
      recipes: [],
      removes: [],
      replaces: [],
      warnings: [{ file: filePath, reason: 'Failed to parse JavaScript AST' }],
      stats: {
        file: filePath,
        recipes: 0,
        removes: 0,
        replaces: 0,
        unparsed: 1,
      },
      parseFailed: true,
    };
  }

  const gtceu = findGtceuRecipeCalls(ast).map((d) => ({
    id: d.id,
    machineId: d.machineId,
    inputs: d.inputs,
    outputs: d.outputs,
    durationTicks: d.durationTicks,
    energy: d.energy,
    source: filePath,
  }));

  const crafting = findCraftingRecipes(ast, filePath);
  const mixer = findMixerHelperCalls(ast, filePath);
  const recipes = [...gtceu, ...crafting, ...mixer];
  const removes = findRemoves(ast);
  const replaces = findReplaces(ast, filePath);
  const tailWarnings = findUnparsedPatterns(ast, filePath);

  return {
    recipes,
    removes,
    replaces,
    warnings: tailWarnings,
    stats: {
      file: filePath,
      recipes: recipes.length,
      removes: removes.length,
      replaces: replaces.length,
      unparsed: tailWarnings.length,
    },
    parseFailed: false,
  };
}
