import traverse from '@babel/traverse';
import type { File, Node } from '@babel/types';
import type { RecipeOp } from '../../../types.js';
import { evalNumeric, stringLiteral } from '../expr.js';
import { fluidStringToFlow, itemStringToFlow } from '../flow-parse.js';

function parseFluidArg(node: import('@babel/types').Node): RecipeOp['inputs'] {
  const flows: RecipeOp['inputs'] = [];
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
      if (id) flows.push({ fluidId: id, amount });
    }
  }
  return flows;
}

/** Static expansion of generateMixerRecipe(event, input, fluid_input, output, circuit, fluid_output, duration, EUt, rpm, id) */
export function findMixerHelperCalls(ast: File, source: string): RecipeOp[] {
  const recipes: RecipeOp[] = [];

  traverse(ast, {
    CallExpression(path) {
      const callee = path.node.callee;
      if (callee.type !== 'Identifier' || callee.name !== 'generateMixerRecipe') return;
      const args = path.node.arguments;
      if (args.length < 10) return;

      const id = stringLiteral(args[9]);
      if (!id) return;
      const duration = evalNumeric(args[6]) ?? 20;
      const eu = evalNumeric(args[7]);

      const recipe: RecipeOp = {
        id: id.includes(':') ? id : `gtceu:${id}`,
        machineId: 'gtceu:mixer',
        inputs: [],
        outputs: [],
        durationTicks: duration,
        source,
      };

      if (eu !== undefined) recipe.energy = { euPerTick: eu };

      const parseItemList = (node: Node | undefined) => {
        if (!node) return;
        if (node.type === 'ArrayExpression') {
          for (const el of node.elements) {
            if (el && el.type !== 'SpreadElement') parseItemList(el);
          }
          return;
        }
        const s = stringLiteral(node);
        if (s) recipe.inputs.push(itemStringToFlow(s));
      };

      parseItemList(args[1]);

      const parseFluidList = (node: Node | undefined, target: 'inputs' | 'outputs') => {
        if (!node) return;
        if (node.type === 'ArrayExpression') {
          for (const el of node.elements) {
            if (el && el.type !== 'SpreadElement') parseFluidList(el, target);
          }
          return;
        }
        const s = stringLiteral(node);
        if (s) {
          const f = fluidStringToFlow(s);
          if (f) recipe[target].push(f);
          return;
        }
        recipe[target].push(...parseFluidArg(node));
      };

      parseFluidList(args[2], 'inputs');
      const itemOut = stringLiteral(args[3]);
      if (itemOut) recipe.outputs.push(itemStringToFlow(itemOut));
      parseFluidList(args[5], 'outputs');

      if (recipe.outputs.length > 0 || recipe.inputs.length > 0) {
        recipes.push(recipe);
      }
    },
  });

  return recipes;
}
