import traverse from '@babel/traverse';
import type { File, Node } from '@babel/types';
import type { RecipeOp } from '../../../types.js';
import type { StartupGlobals } from '../../parse-globals.js';
import { globalObjectList } from '../../parse-globals.js';

function globalForEachKey(node: Node): string | undefined {
  if (node.type !== 'MemberExpression') return undefined;
  if (node.object.type !== 'Identifier' || node.object.name !== 'global') return undefined;
  if (node.property.type !== 'Identifier') return undefined;
  return node.property.name;
}

function memberChainMethod(node: Node): string | undefined {
  if (node.type !== 'MemberExpression' || node.property.type !== 'Identifier') return undefined;
  return node.property.name;
}

/** Expand food/repair/recycling `global.*.forEach` → `event.recipes.gtceu.*` patterns. */
export function expandFoodAndRepairForEach(
  ast: File,
  globals: StartupGlobals,
  source: string,
): { recipes: RecipeOp[]; handledLines: Set<number> } {
  const recipes: RecipeOp[] = [];
  const handledLines = new Set<number>();

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

      let call = stmt.expression;
      while (call.callee.type === 'MemberExpression') {
        const method = memberChainMethod(call.callee);
        if (!method) break;
        if (method === 'inputItems' || method === 'outputItems' || method === 'itemInputs' || method === 'itemOutputs') {
          if (call.callee.object.type === 'CallExpression') {
            call = call.callee.object;
            continue;
          }
        }
        break;
      }

      if (call.callee.type !== 'MemberExpression') return;
      const machine = memberChainMethod(call.callee);
      if (!machine) return;

      const line = path.node.loc?.start.line;
      const duration = 200;
      const eut = 7;

      if (globalKey === 'TFC_MEAT_RECIPE_COMPONENTS' && machine === 'smelting') {
        const rows = globalObjectList(globals, globalKey);
        if (!rows) return;
        for (const row of rows) {
          const input = row.input;
          const output = row.output;
          const name = row.name;
          if (typeof input !== 'string' || typeof output !== 'string' || typeof name !== 'string') continue;
          recipes.push({
            id: `tfg:smelting/${name}`,
            machineId: 'gtceu:smelting',
            inputs: [{ itemId: input, amount: 1 }],
            outputs: [{ itemId: output, amount: 1 }],
            durationTicks: duration,
            energy: { euPerTick: eut },
            source,
          });
        }
        if (line) handledLines.add(line);
        return;
      }

      if (globalKey === 'TFC_ALCOHOL' && machine === 'fermenter') {
        const rows = globalObjectList(globals, globalKey);
        if (!rows) return;
        for (const row of rows) {
          const id = row.id;
          if (typeof id !== 'string') continue;
          recipes.push({
            id: `tfg:fermenter/${id.replace(/:/g, '_')}`,
            machineId: 'gtceu:fermenter',
            inputs: [{ itemId: id, amount: 1 }],
            outputs: [{ fluidId: id, amount: 1000 }],
            durationTicks: 600,
            source,
          });
        }
        if (line) handledLines.add(line);
      }
    },
  });

  return { recipes, handledLines };
}
