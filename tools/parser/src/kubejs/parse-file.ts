import { readFileSync } from 'node:fs';
import type { FileParseStats, ParseWarning, RecipeOp, ReplaceOp, RecipePatch } from '../types.js';
import { parseKubeJs } from './ast/parse.js';
import { findGtceuRecipeCalls } from './ast/extractors/gtceu.js';
import { findRemoves, type RemoveSelector } from './ast/extractors/remove.js';
import { findReplaces } from './ast/extractors/replace.js';
import { findCraftingRecipes } from './ast/extractors/shaped.js';
import { findMixerHelperCalls } from './ast/extractors/helpers.js';
import { findGreenhouseHelperCalls, findHandledForEachLines, expandGlobalForEach } from './ast/extractors/loops.js';
import { expandFoodAndRepairForEach } from './ast/extractors/food-loops.js';
import { findRecipePatches, buildCircuitPatchesFromGlobals, findAddCircuitForEachLines } from './ast/extractors/patch.js';
import { findUnparsedPatterns } from './ast/extractors/tail.js';
import type { StartupGlobals } from './parse-globals.js';

export interface ParseFileOptions {
  globals?: StartupGlobals;
}

export interface FileParseResult {
  recipes: RecipeOp[];
  patches: RecipePatch[];
  removes: RemoveSelector[];
  replaces: ReplaceOp[];
  warnings: ParseWarning[];
  stats: FileParseStats;
  parseFailed: boolean;
}

export function parseKubeJsFile(filePath: string, options: ParseFileOptions = {}): FileParseResult {
  const source = readFileSync(filePath, 'utf-8');
  const ast = parseKubeJs(source, filePath);

  if (!ast) {
    return {
      recipes: [],
      patches: [],
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
  const greenhouse = findGreenhouseHelperCalls(ast, filePath);
  const globalExpanded = options.globals
    ? expandGlobalForEach(ast, options.globals, filePath)
    : { recipes: [], handledLines: new Set<number>() };
  const foodExpanded = options.globals
    ? expandFoodAndRepairForEach(ast, options.globals, filePath)
    : { recipes: [], handledLines: new Set<number>() };
  const circuitPatches = options.globals ? buildCircuitPatchesFromGlobals(options.globals) : [];
  const patches = [...findRecipePatches(ast, filePath), ...circuitPatches];
  const recipes = [
    ...gtceu,
    ...crafting,
    ...mixer,
    ...greenhouse,
    ...globalExpanded.recipes,
    ...foodExpanded.recipes,
  ];
  const removes = findRemoves(ast);
  const replaces = findReplaces(ast, filePath);
  const addCircuitLines = options.globals ? findAddCircuitForEachLines(ast) : new Set<number>();
  const handledForEach = findHandledForEachLines(
    ast,
    new Set([...globalExpanded.handledLines, ...foodExpanded.handledLines, ...addCircuitLines]),
  );
  const tailWarnings = findUnparsedPatterns(ast, filePath).filter(
    (w) =>
      !(
        w.reason.includes('.forEach') &&
        w.line !== undefined &&
        handledForEach.has(w.line)
      ),
  );

  return {
    recipes,
    patches,
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
