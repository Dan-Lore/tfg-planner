import traverse from '@babel/traverse';
import type { File, ObjectExpression } from '@babel/types';
import { stringLiteral } from '../expr.js';

export interface RemoveSelector {
  id?: string;
  mod?: string;
  type?: string;
  output?: string;
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
    }
  }
  if (!sel.id && !sel.mod && !sel.type && !sel.output) return null;
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

export function removeMatchesId(sel: RemoveSelector, recipeId: string): boolean {
  if (sel.id) return sel.id === recipeId;
  if (sel.mod) {
    const prefix = sel.mod + ':';
    return recipeId.startsWith(prefix);
  }
  return false;
}
