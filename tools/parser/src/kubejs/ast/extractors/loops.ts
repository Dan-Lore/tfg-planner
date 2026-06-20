import traverse from '@babel/traverse';
import type { File, Node } from '@babel/types';
import type { RecipeOp } from '../../../types.js';
import { evalNumeric, stringLiteral } from '../expr.js';
import type { StartupGlobals } from '../../parse-globals.js';
import { globalObjectList, globalStringList } from '../../parse-globals.js';
import {
  expandCropGreenhouseCall,
  expandGreenhouseCall,
  expandTreeGreenhouseCall,
} from './greenhouse.js';

function parseStringOrItemOf(node: Node | undefined): string | undefined {
  if (!node) return undefined;
  const s = stringLiteral(node);
  if (s) return s;
  if (node.type === 'CallExpression') {
    const callee = node.callee;
    if (
      callee.type === 'MemberExpression' &&
      callee.property.type === 'Identifier' &&
      callee.property.name === 'of' &&
      node.arguments[0]
    ) {
      const id = stringLiteral(node.arguments[0]);
      const amount = evalNumeric(node.arguments[1]) ?? 1;
      if (id) return amount === 1 ? id : `${amount}x ${id}`;
    }
  }
  return undefined;
}

function parseOutputArg(node: Node | undefined): string[] | undefined {
  if (!node) return undefined;
  if (node.type === 'ArrayExpression') {
    const out: string[] = [];
    for (const el of node.elements) {
      const s = el && el.type !== 'SpreadElement' ? parseStringOrItemOf(el) : undefined;
      if (s) out.push(s);
    }
    return out.length > 0 ? out : undefined;
  }
  const single = parseStringOrItemOf(node);
  return single ? [single] : undefined;
}

function parseDimension(node: Node | undefined): string | null {
  if (!node || node.type === 'NullLiteral') return null;
  return stringLiteral(node) ?? null;
}

function parseNullishItem(node: Node | undefined): string | null {
  if (!node || node.type === 'NullLiteral') return null;
  return parseStringOrItemOf(node) ?? null;
}

export function findGreenhouseHelperCalls(ast: File, source: string): RecipeOp[] {
  const recipes: RecipeOp[] = [];
  const seen = new Set<string>();

  const pushAll = (batch: RecipeOp[]) => {
    for (const r of batch) {
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      recipes.push(r);
    }
  };

  traverse(ast, {
    CallExpression(path) {
      const callee = path.node.callee;
      if (callee.type !== 'Identifier') return;

      const args = path.node.arguments;

      if (callee.name === 'generateGreenHouseRecipe') {
        const dimension = parseDimension(args[1]);
        const input = parseStringOrItemOf(args[2]);
        const outputs = parseOutputArg(args[3]);
        const circuitRaw = args[5];
        const circuit =
          circuitRaw?.type === 'NullLiteral' ? null : (evalNumeric(circuitRaw) ?? null);
        const chanceMultiplier = evalNumeric(args[4]) ?? 1;
        if (!input || !outputs) return;
        pushAll(
          expandGreenhouseCall({ dimension, input, outputs, circuit, chanceMultiplier }, source),
        );
        return;
      }

      if (callee.name === 'generateCropGreenHouseRecipe') {
        const dimension = parseDimension(args[1]);
        const input = parseStringOrItemOf(args[2]);
        const output = parseStringOrItemOf(args[3]);
        const leaves = parseNullishItem(args[4]);
        if (!input || !output) return;
        pushAll(expandCropGreenhouseCall(dimension, input, output, leaves, source));
        return;
      }

      if (callee.name === 'generateTreeGreenHouseRecipe') {
        const dimension = parseDimension(args[1]);
        const input = parseStringOrItemOf(args[2]);
        const output = parseStringOrItemOf(args[3]);
        const leaves = parseNullishItem(args[4]);
        if (!input || !output) return;
        pushAll(expandTreeGreenhouseCall(dimension, input, output, leaves, source));
      }
    },
  });

  return recipes;
}

function globalForEachKey(node: Node): string | undefined {
  if (node.type !== 'MemberExpression') return undefined;
  if (node.object.type !== 'Identifier' || node.object.name !== 'global') return undefined;
  if (node.property.type !== 'Identifier') return undefined;
  return node.property.name;
}

/** Expand `global.VAR.forEach(...)` greenhouse loops using startup globals. */
export function expandGlobalForEach(
  ast: File,
  globals: StartupGlobals,
  source: string,
): { recipes: RecipeOp[]; handledLines: Set<number> } {
  const recipes: RecipeOp[] = [];
  const handledLines = new Set<number>();
  const seen = new Set<string>();

  const pushAll = (batch: RecipeOp[]) => {
    for (const r of batch) {
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      recipes.push(r);
    }
  };

  traverse(ast, {
    CallExpression(path) {
      const callee = path.node.callee;
      if (
        callee.type !== 'MemberExpression' ||
        callee.property.type !== 'Identifier' ||
        callee.property.name !== 'forEach'
      ) {
        return;
      }

      const globalKey = globalForEachKey(callee.object);
      if (!globalKey) return;

      const callback = path.node.arguments[0];
      if (!callback || callback.type !== 'ArrowFunctionExpression') return;
      const body = callback.body;
      if (body.type !== 'BlockStatement' || body.body.length !== 1) return;
      const stmt = body.body[0];
      if (stmt.type !== 'ExpressionStatement' || stmt.expression.type !== 'CallExpression') return;
      const inner = stmt.expression;
      if (inner.callee.type !== 'Identifier') return;
      const helper = inner.callee.name;
      const line = path.node.loc?.start.line;

      if (helper === 'generateTreeGreenHouseRecipe') {
        const dimension = parseDimension(inner.arguments[1]);
        void (evalNumeric(inner.arguments[5]) ?? 1);

        if (globalKey === 'TFC_WOOD_TYPES') {
          const woods = globalStringList(globals, globalKey);
          if (!woods) return;
          for (const wood of woods) {
            pushAll(
              expandTreeGreenhouseCall(
                dimension,
                `tfc:wood/sapling/${wood}`,
                `tfc:wood/log/${wood}`,
                `tfc:wood/leaves/${wood}`,
                source,
              ),
            );
          }
          if (line) handledLines.add(line);
          return;
        }

        if (globalKey === 'AFC_SAPLINGS') {
          const rows = globalObjectList(globals, globalKey);
          if (!rows) return;
          for (const row of rows) {
            const sapling = row.sapling;
            const log = row.log;
            if (typeof sapling !== 'string' || typeof log !== 'string') continue;
            pushAll(
              expandTreeGreenhouseCall(
                dimension,
                `afc:wood/sapling/${sapling}`,
                log,
                `afc:wood/leaves/${sapling}`,
                source,
              ),
            );
          }
          if (line) handledLines.add(line);
          return;
        }

        if (globalKey === 'WAB_WOOD' || globalKey === 'TFG_NEW_WOOD_TYPES') {
          const rows = globalObjectList(globals, globalKey);
          if (!rows) return;
          for (const row of rows) {
            const name = row.name;
            if (typeof name !== 'string') continue;
            const logPrefix =
              globalKey === 'WAB_WOOD' ? `wan_ancient_beasts:${name}_log` : `tfg:wood/log/${name}`;
            pushAll(
              expandTreeGreenhouseCall(
                dimension,
                `tfg:wood/sapling/${name}`,
                logPrefix,
                `tfg:wood/leaves/${name}`,
                source,
              ),
            );
          }
          if (line) handledLines.add(line);
          return;
        }
      }

      if (helper === 'generateCropGreenHouseRecipe') {
        const dimension = parseDimension(inner.arguments[1]);
        void (evalNumeric(inner.arguments[5]) ?? 1);

        const cropGlobals = new Set([
          'FIRMALIFE_GREENHOUSE_FRUIT_RECIPE_COMPONENTS',
          'TFC_GREENHOUSE_FRUIT_RECIPE_COMPONENTS',
          'TFC_GREENHOUSE_VEGETABLE_RECIPE_COMPONENTS',
          'TFC_GREENHOUSE_BERRY_RECIPE_COMPONENTS',
        ]);
        if (!cropGlobals.has(globalKey)) return;

        const rows = globalObjectList(globals, globalKey);
        if (!rows) return;
        for (const row of rows) {
          const input = row.input;
          const output = row.output;
          if (typeof input !== 'string' || typeof output !== 'string') continue;
          const leaves = typeof row.leaves === 'string' ? row.leaves : null;
          pushAll(expandCropGreenhouseCall(dimension, input, output, leaves, source));
        }
        if (line) handledLines.add(line);
      }
    },
  });

  return { recipes, handledLines };
}

/** Lines with forEach calls that were statically expanded (suppress tail warnings). */
export function findHandledForEachLines(ast: File, extraHandled?: Set<number>): Set<number> {
  const lines = new Set<number>(extraHandled);

  traverse(ast, {
    CallExpression(path) {
      const callee = path.node.callee;
      if (
        callee.type !== 'MemberExpression' ||
        callee.property.type !== 'Identifier' ||
        callee.property.name !== 'forEach'
      ) {
        return;
      }
      const arr = callee.object;
      if (arr.type !== 'ArrayExpression') return;
      const callback = path.node.arguments[0];
      if (!callback || callback.type !== 'ArrowFunctionExpression') return;
      const body = callback.body;
      if (body.type !== 'BlockStatement') return;
      for (const stmt of body.body) {
        if (stmt.type !== 'ExpressionStatement' || stmt.expression.type !== 'CallExpression') continue;
        const inner = stmt.expression.callee;
        if (inner.type === 'MemberExpression' && inner.property.type === 'Identifier') {
          if (inner.property.name === 'modifyRecipe') {
            const line = path.node.loc?.start.line;
            if (line) lines.add(line);
          }
        }
      }
    },
  });

  return lines;
}
