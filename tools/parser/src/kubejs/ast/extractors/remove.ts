import traverse from '@babel/traverse';
import type { File, ObjectExpression } from '@babel/types';
import { stringLiteral } from '../expr.js';
import type { RecipeOp } from '../../../types.js';

export interface RemoveSelector {
  id?: string;
  mod?: string;
  type?: string;
  output?: string;
  input?: string;
}

function parseRemoveObject(obj: ObjectExpression): RemoveSelector | null {
  const sel: RemoveSelector = {};
  for (const prop of obj.properties) {
    if (prop.type !== 'ObjectProperty') continue;
    const key =
      prop.key.type === 'Identifier'
        ? prop.key.name
        : prop.key.type === 'StringLiteral'
          ? prop.key.value
          : null;
    if (!key) continue;
    const val = stringLiteral(prop.value);
    if (val !== undefined) {
      if (key === 'id') sel.id = val;
      if (key === 'mod') sel.mod = val;
      if (key === 'type') sel.type = val;
      if (key === 'output') sel.output = val;
      if (key === 'input') sel.input = val;
    }
  }
  if (!sel.id && !sel.mod && !sel.type && !sel.output && !sel.input) return null;
  return sel;
}

export function findRemoves(ast: File): RemoveSelector[] {
  const removes: RemoveSelector[] = [];
  traverse(ast, {
    CallExpression(path) {
      const callee = path.node.callee;
      if (
        callee.type !== 'MemberExpression' ||
        callee.property.type !== 'Identifier' ||
        callee.property.name !== 'remove'
      ) {
        return;
      }
      const arg = path.node.arguments[0];
      if (!arg || arg.type !== 'ObjectExpression') return;
      const sel = parseRemoveObject(arg);
      if (sel) removes.push(sel);
    },
  });
  return removes;
}

function flowMatchesNeedle(
  flow: { itemId?: string; fluidId?: string },
  needle: string,
): boolean {
  return flow.itemId === needle || flow.fluidId === needle;
}

/** Match a remove selector against a full recipe (not id-only). */
export function removeMatchesRecipe(sel: RemoveSelector, recipe: RecipeOp): boolean {
  if (sel.id) return sel.id === recipe.id;

  const hasExtra = sel.type != null || sel.output != null || sel.input != null;

  if (sel.mod != null && !recipe.id.startsWith(`${sel.mod}:`)) {
    return false;
  }

  if (!hasExtra) {
    return sel.mod != null;
  }

  if (sel.type != null && recipe.machineId !== sel.type) {
    return false;
  }

  if (sel.input != null && !recipe.inputs.some((f) => flowMatchesNeedle(f, sel.input!))) {
    return false;
  }

  if (sel.output != null && !recipe.outputs.some((f) => flowMatchesNeedle(f, sel.output!))) {
    return false;
  }

  return sel.mod != null || sel.type != null || sel.input != null || sel.output != null;
}

/** @deprecated Prefer removeMatchesRecipe — kept for explicit id checks. */
export function removeMatchesId(sel: RemoveSelector, recipeId: string): boolean {
  if (sel.id) return sel.id === recipeId;
  if (sel.mod && !sel.type && !sel.output && !sel.input) {
    return recipeId.startsWith(`${sel.mod}:`);
  }
  return false;
}
