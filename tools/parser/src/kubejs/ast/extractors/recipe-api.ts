import type {
  ArrowFunctionExpression,
  CallExpression,
  Expression,
  FunctionExpression,
  Node,
} from '@babel/types';

/** Known KubeJS helpers that mutate or create machine recipes. */
const RECIPE_HELPER_NAMES = new Set([
  'addCircuitToRecipe',
  'addCleanroom',
  'generateGreenHouseRecipe',
  'generateCropGreenHouseRecipe',
  'generateTreeGreenHouseRecipe',
  'generateMixerRecipe',
  'modifyRecipes',
]);

/** `event.*` call names that create or edit recipes (not tag/data/loot APIs). */
const RECIPE_EVENT_METHODS = new Set([
  'remove',
  'replaceInput',
  'replaceOutput',
  'shapeless',
  'smelting',
  'smoking',
  'blasting',
  'stonecutting',
  'campfireCooking',
  'custom',
  'recipes',
]);

export function isTagContextFile(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/');
  const base = normalized.split('/').pop() ?? '';
  return base.startsWith('tags') || normalized.includes('/tags/');
}

export function isInfrastructureFile(filePath: string): boolean {
  const base = filePath.replace(/\\/g, '/').split('/').pop() ?? '';
  return base === 'utility.recipes.js';
}

function isRecipeEventRemove(call: CallExpression): boolean {
  const callee = call.callee;
  if (callee.type !== 'MemberExpression' || callee.property.type !== 'Identifier') return false;
  if (callee.property.name !== 'remove') return false;
  if (callee.object.type !== 'Identifier' || callee.object.name !== 'event') return false;
  const first = call.arguments[0];
  return first?.type === 'ObjectExpression';
}

function memberChainStartsWithEvent(node: Expression): boolean {
  if (node.type === 'Identifier' && node.name === 'event') return true;
  if (node.type === 'MemberExpression') {
    return memberChainStartsWithEvent(node.object as Expression);
  }
  return false;
}

function isGlobalModifyRecipeCall(call: CallExpression): boolean {
  const callee = call.callee;
  return (
    callee.type === 'MemberExpression' &&
    callee.property.type === 'Identifier' &&
    callee.property.name === 'modifyRecipe' &&
    callee.object.type === 'Identifier' &&
    callee.object.name === 'global'
  );
}

/** True when a call expression touches recipe creation or mutation APIs. */
export function callTouchesRecipeApi(call: CallExpression): boolean {
  const callee = call.callee;

  if (callee.type === 'Identifier') {
    return RECIPE_HELPER_NAMES.has(callee.name);
  }

  if (isGlobalModifyRecipeCall(call)) return true;

  if (callee.type !== 'MemberExpression' || callee.property.type !== 'Identifier') {
    return false;
  }

  const method = callee.property.name;

  if (method === 'forEach') return false;

  if (method === 'findRecipes') {
    return memberChainStartsWithEvent(callee.object as Expression);
  }

  if (method === 'modifyResult') return false;

  if (isRecipeEventRemove(call)) return true;

  if (RECIPE_EVENT_METHODS.has(method) && memberChainStartsWithEvent(callee.object as Expression)) {
    return true;
  }

  if (method === 'gtceu' || method === 'create' || method === 'tfc') {
    return memberChainStartsWithEvent(callee.object as Expression);
  }

  return false;
}

function collectCallsInNode(node: Node, out: CallExpression[]): void {
  if (!node || typeof node !== 'object') return;

  if (node.type === 'CallExpression') {
    out.push(node);
  }

  for (const key of Object.keys(node)) {
    const child = (node as Record<string, unknown>)[key];
    if (!child) continue;
    if (Array.isArray(child)) {
      for (const item of child) {
        if (item && typeof item === 'object' && 'type' in item) {
          collectCallsInNode(item as Node, out);
        }
      }
    } else if (typeof child === 'object' && child !== null && 'type' in child) {
      collectCallsInNode(child as Node, out);
    }
  }
}

const GREENHOUSE_HELPER_NAMES = new Set([
  'generateGreenHouseRecipe',
  'generateCropGreenHouseRecipe',
  'generateTreeGreenHouseRecipe',
]);

export function callbackOnlyGreenhouseHelpers(
  callback: ArrowFunctionExpression | FunctionExpression | undefined,
): boolean {
  if (!callback) return false;
  const calls: CallExpression[] = [];
  const body = callback.body;
  if (body.type === 'BlockStatement') {
    for (const stmt of body.body) collectCallsInNode(stmt, calls);
  } else {
    collectCallsInNode(body, calls);
  }
  if (calls.length === 0) return false;
  return calls.every((call) => {
    const callee = call.callee;
    return callee.type === 'Identifier' && GREENHOUSE_HELPER_NAMES.has(callee.name);
  });
}

export function callbackTouchesRecipeApi(
  callback: ArrowFunctionExpression | FunctionExpression | undefined,
): boolean {
  if (!callback) return false;
  const body = callback.body;
  const calls: CallExpression[] = [];

  if (body.type === 'BlockStatement') {
    for (const stmt of body.body) {
      collectCallsInNode(stmt, calls);
    }
  } else {
    collectCallsInNode(body, calls);
  }

  return calls.some(callTouchesRecipeApi);
}

function stringArg(node: Node | undefined): string | undefined {
  if (node?.type === 'StringLiteral') return node.value;
  return undefined;
}

/** `recipe.json.get|add|remove` keys used inside a callback. */
function recipeJsonKeysTouched(callback: ArrowFunctionExpression | FunctionExpression): Set<string> {
  const keys = new Set<string>();
  const calls: CallExpression[] = [];
  const body = callback.body;
  if (body.type === 'BlockStatement') {
    for (const stmt of body.body) collectCallsInNode(stmt, calls);
  } else {
    collectCallsInNode(body, calls);
  }

  for (const call of calls) {
    const callee = call.callee;
    if (callee.type !== 'MemberExpression' || callee.property.type !== 'Identifier') continue;
    const prop = callee.property.name;
    if (prop !== 'get' && prop !== 'add' && prop !== 'remove') continue;
    const obj = callee.object;
    if (
      obj.type === 'MemberExpression' &&
      obj.property.type === 'Identifier' &&
      obj.property.name === 'json'
    ) {
      const key = stringArg(call.arguments[0]);
      if (key) keys.add(key);
    }
  }

  return keys;
}

export function isRecipeConditionsOnlyCallback(
  callback: ArrowFunctionExpression | FunctionExpression | undefined,
): boolean {
  if (!callback) return false;
  const keys = recipeJsonKeysTouched(callback);
  if (keys.size === 0) {
    const calls: CallExpression[] = [];
    const body = callback.body;
    if (body.type === 'BlockStatement') {
      for (const stmt of body.body) collectCallsInNode(stmt, calls);
    } else {
      collectCallsInNode(body, calls);
    }
    return calls.some((call) => {
      const callee = call.callee;
      return (
        callee.type === 'MemberExpression' &&
        callee.property.type === 'Identifier' &&
        callee.property.name === 'add' &&
        callee.object.type === 'MemberExpression' &&
        callee.object.property.type === 'Identifier' &&
        callee.object.property.name === 'json' &&
        stringArg(call.arguments[0]) === 'recipeConditions'
      );
    });
  }
  for (const key of keys) {
    if (key !== 'recipeConditions') return false;
  }
  return true;
}

export function isFindRecipesCall(node: CallExpression): boolean {
  const callee = node.callee;
  return (
    callee.type === 'MemberExpression' &&
    callee.property.type === 'Identifier' &&
    callee.property.name === 'findRecipes' &&
    memberChainStartsWithEvent(callee.object as Expression)
  );
}

export function isForEachOnFindRecipes(call: CallExpression): boolean {
  const callee = call.callee;
  if (
    callee.type !== 'MemberExpression' ||
    callee.property.type !== 'Identifier' ||
    callee.property.name !== 'forEach'
  ) {
    return false;
  }
  return callee.object.type === 'CallExpression' && isFindRecipesCall(callee.object);
}
