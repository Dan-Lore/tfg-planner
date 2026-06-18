import traverse, { type NodePath } from '@babel/traverse';
import type { CallExpression, File } from '@babel/types';
import type { ParseWarning, WarningKind } from '../../../types.js';
import {
  callbackTouchesRecipeApi,
  callbackOnlyGreenhouseHelpers,
  isFindRecipesCall,
  isForEachOnFindRecipes,
  isInfrastructureFile,
  isRecipeConditionsOnlyCallback,
  isTagContextFile,
} from './recipe-api.js';

function pushWarning(
  warnings: ParseWarning[],
  file: string,
  kind: WarningKind,
  detail: string,
  line?: number,
): void {
  warnings.push({
    file,
    kind,
    reason: `Dynamic pattern not statically resolved: ${detail}`,
    line,
  });
}

function isChainedBeforeForEach(path: NodePath<CallExpression>): boolean {
  const parent = path.parentPath;
  if (!parent?.isMemberExpression()) return false;
  const prop = parent.get('property');
  if (!prop.isIdentifier({ name: 'forEach' })) return false;
  return parent.get('object').node === path.node;
}

function forEachCallback(path: NodePath<CallExpression>) {
  const callback = path.node.arguments[0];
  if (
    callback?.type === 'ArrowFunctionExpression' ||
    callback?.type === 'FunctionExpression'
  ) {
    return callback;
  }
  return undefined;
}

/** Detect dynamic patterns — warnings only, no fake recipes. */
export function findUnparsedPatterns(ast: File, file: string): ParseWarning[] {
  const warnings: ParseWarning[] = [];

  if (isInfrastructureFile(file)) {
    return warnings;
  }

  const tagFile = isTagContextFile(file);

  traverse(ast, {
    CallExpression(path) {
      const node = path.node;
      const callee = node.callee;
      const line = node.loc?.start.line;

      if (callee.type === 'MemberExpression' && callee.property.type === 'Identifier') {
        const name = callee.property.name;

        if (name === 'modifyResult') {
          return;
        }

        if (name === 'modifyRecipe') {
          if (
            callee.object.type === 'Identifier' &&
            callee.object.name === 'global'
          ) {
            return;
          }
          pushWarning(warnings, file, 'modifyRecipe', 'event.modifyRecipe(…)', line);
          return;
        }

        if (name === 'findRecipes') {
          if (!isFindRecipesCall(node)) return;
          if (isChainedBeforeForEach(path)) return;
          const arg = node.arguments[1];
          const fn =
            arg?.type === 'ArrowFunctionExpression' || arg?.type === 'FunctionExpression'
              ? arg
              : undefined;
          if (isRecipeConditionsOnlyCallback(fn)) return;
          pushWarning(warnings, file, 'findRecipes', 'event.findRecipes(…)', line);
          return;
        }

        if (name === 'forEach') {
          if (tagFile) return;

          if (isForEachOnFindRecipes(node)) {
            const fn = forEachCallback(path);
            if (isRecipeConditionsOnlyCallback(fn)) return;
            pushWarning(warnings, file, 'findRecipes', 'event.findRecipes(…)', line);
            return;
          }

          const fn = forEachCallback(path);
          if (!callbackTouchesRecipeApi(fn)) return;
          if (callbackOnlyGreenhouseHelpers(fn)) return;

          pushWarning(
            warnings,
            file,
            'forEach',
            'Loop-based recipe generation not statically resolved (.forEach)',
            line,
          );
        }
      }
    },
  });

  return warnings;
}
