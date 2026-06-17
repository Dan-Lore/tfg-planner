import traverse from '@babel/traverse';
import type { File } from '@babel/types';
import type { RecipeOp } from '../../../types.js';
import { stringLiteral } from '../expr.js';
import { itemStringToFlow } from '../flow-parse.js';

function craftingMachineId(kind: 'shaped' | 'shapeless' | 'smelting'): string {
  if (kind === 'smelting') return 'minecraft:smelting';
  return `minecraft:${kind}`;
}

export function findCraftingRecipes(ast: File, source: string): RecipeOp[] {
  const recipes: RecipeOp[] = [];

  traverse(ast, {
    CallExpression(path) {
      const callee = path.node.callee;
      if (callee.type !== 'MemberExpression' || callee.property.type !== 'Identifier') {
        return;
      }
      const method = callee.property.name;
      if (method !== 'shaped' && method !== 'shapeless' && method !== 'smelting') return;

      let recipeId: string | undefined;
      const parent = path.parentPath;
      if (
        parent?.isMemberExpression() &&
        parent.node.property.type === 'Identifier' &&
        parent.node.property.name === 'id'
      ) {
        const idCall = parent.parentPath;
        if (idCall?.isCallExpression() && idCall.node.arguments[0]) {
          recipeId = stringLiteral(idCall.node.arguments[0]);
        }
      }

      if (!recipeId) return;

      const args = path.node.arguments;
      const outputStr = stringLiteral(args[0]);
      if (!outputStr) return;
      const output = itemStringToFlow(outputStr);

      const inputs: RecipeOp['inputs'] = [];
      if (method === 'smelting' && args[1]) {
        const inp = stringLiteral(args[1]);
        if (inp) inputs.push(itemStringToFlow(inp));
      } else if (args[2]?.type === 'ObjectExpression') {
        for (const prop of args[2].properties) {
          if (prop.type !== 'ObjectProperty') continue;
          const val = stringLiteral(prop.value);
          if (val) inputs.push(itemStringToFlow(val));
        }
      }

      recipes.push({
        id: recipeId,
        machineId: craftingMachineId(method as 'shaped' | 'shapeless' | 'smelting'),
        inputs,
        outputs: [output],
        durationTicks: method === 'smelting' ? 200 : 20,
        source,
      });
    },
  });

  return recipes;
}
