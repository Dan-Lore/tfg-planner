import traverse from '@babel/traverse';
import type { File } from '@babel/types';
import type { ParseWarning } from '../../../types.js';

/** Phase 3: detect dynamic patterns — warnings only, no fake recipes. */
export function findUnparsedPatterns(ast: File, file: string): ParseWarning[] {
  const warnings: ParseWarning[] = [];

  traverse(ast, {
    CallExpression(path) {
      const callee = path.node.callee;
      if (callee.type === 'MemberExpression' && callee.property.type === 'Identifier') {
        const name = callee.property.name;
        if (name === 'findRecipes' || name === 'modifyResult' || name === 'modifyRecipe') {
          warnings.push({
            file,
            reason: `Dynamic pattern not statically resolved: event.${name}(…)`,
            line: path.node.loc?.start.line,
          });
        }
        if (name === 'forEach') {
          warnings.push({
            file,
            reason: 'Loop-based recipe generation not statically resolved (.forEach)',
            line: path.node.loc?.start.line,
          });
        }
      }
    },
  });

  return warnings;
}
