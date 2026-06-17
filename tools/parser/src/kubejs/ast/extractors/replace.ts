import traverse from '@babel/traverse';
import type { File, ObjectExpression } from '@babel/types';
import type { ReplaceOp } from '../../../types.js';
import { stringLiteral } from '../expr.js';

function parseSelector(obj: ObjectExpression): ReplaceOp['selector'] {
  const sel: ReplaceOp['selector'] = {};
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
    if (val === undefined) continue;
    if (key === 'id') sel.id = val;
    if (key === 'mod') sel.mod = val;
    if (key === 'output') sel.output = val;
  }
  return sel;
}

export function findReplaces(ast: File, source: string): ReplaceOp[] {
  const replaces: ReplaceOp[] = [];
  traverse(ast, {
    CallExpression(path) {
      const callee = path.node.callee;
      if (
        callee.type !== 'MemberExpression' ||
        callee.property.type !== 'Identifier' ||
        callee.property.name !== 'replaceInput'
      ) {
        return;
      }
      const args = path.node.arguments;
      if (args.length < 3) return;
      const selArg = args[0];
      const oldArg = args[1];
      const newArg = args[2];
      if (selArg.type !== 'ObjectExpression') return;
      const oldInput = stringLiteral(oldArg);
      const newInput = stringLiteral(newArg);
      if (!oldInput || !newInput) return;
      replaces.push({
        selector: parseSelector(selArg),
        oldInput,
        newInput,
        source,
      });
    },
  });
  return replaces;
}
