import traverse from '@babel/traverse';
import type { File, Node, ObjectExpression } from '@babel/types';
import type { RecipePatch, FlowOp } from '../../../types.js';
import { getCircuitEntries, type StartupGlobals } from '../../parse-globals.js';
import { evalNumeric, stringLiteral } from '../expr.js';
import { fluidStringToFlow, itemStringToFlow } from '../flow-parse.js';

function unfuckGtId(id: string): string {
  return id.startsWith('gtceu:') ? id.slice('gtceu:'.length) : id;
}

function parseItemArg(node: Node): FlowOp[] {
  const s = stringLiteral(node);
  if (s) return [itemStringToFlow(s)];
  if (node.type === 'CallExpression') {
    const callee = node.callee;
    if (
      callee.type === 'MemberExpression' &&
      callee.property.type === 'Identifier' &&
      callee.property.name === 'of' &&
      node.arguments[0]
    ) {
      const id = stringLiteral(node.arguments[0]);
      const amount =
        node.arguments[1] && evalNumeric(node.arguments[1]) !== undefined
          ? (evalNumeric(node.arguments[1]) as number)
          : 1;
      if (id) return [{ itemId: id, amount }];
    }
  }
  return [];
}

function parseFluidArg(node: Node): FlowOp[] {
  const s = stringLiteral(node);
  if (s) {
    const f = fluidStringToFlow(s);
    return f ? [f] : [];
  }
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
      if (id) return [{ fluidId: id, amount }];
    }
  }
  return [];
}

function parseFluidMap(node: Node | undefined): Record<string, number> | undefined {
  if (!node || node.type !== 'ObjectExpression') return undefined;
  const out: Record<string, number> = {};
  for (const prop of node.properties) {
    if (prop.type !== 'ObjectProperty') continue;
    const key =
      prop.key.type === 'StringLiteral'
        ? prop.key.value
        : prop.key.type === 'Identifier'
          ? prop.key.name
          : undefined;
    const amount = evalNumeric(prop.value);
    if (key && amount !== undefined) out[key] = amount;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function parsePatchObject(node: Node | undefined): Partial<RecipePatch> {
  if (!node || node.type !== 'ObjectExpression') return {};
  const patch: Partial<RecipePatch> = {};

  for (const prop of node.properties) {
    if (prop.type !== 'ObjectProperty') continue;
    const key =
      prop.key.type === 'Identifier'
        ? prop.key.name
        : prop.key.type === 'StringLiteral'
          ? prop.key.value
          : undefined;
    if (!key) continue;

    switch (key) {
      case 'newId': {
        const id = stringLiteral(prop.value);
        if (id) patch.newId = id.includes(':') ? id : `gtceu:${id}`;
        break;
      }
      case 'duration': {
        const d = evalNumeric(prop.value);
        if (d !== undefined) patch.durationTicks = d;
        break;
      }
      case 'itemInputs':
        patch.replaceItemInputs = parseFlowList(prop.value);
        break;
      case 'itemOutputs':
        patch.replaceItemOutputs = parseFlowList(prop.value);
        break;
      case 'inputFluids':
        patch.replaceInputFluids = parseFluidList(prop.value);
        break;
      case 'outputFluids':
      case 'fluidOutputs':
        if (prop.value.type === 'ObjectExpression') {
          patch.fluidOutputAmounts = parseFluidMap(prop.value);
        } else {
          patch.replaceOutputFluids = parseFluidList(prop.value);
        }
        break;
      default:
        break;
    }
  }
  return patch;
}

function parseFlowList(node: Node): FlowOp[] {
  const out: FlowOp[] = [];
  if (node.type === 'ArrayExpression') {
    for (const el of node.elements) {
      if (!el || el.type === 'SpreadElement') continue;
      out.push(...parseItemArg(el));
    }
  } else {
    out.push(...parseItemArg(node));
  }
  return out;
}

function parseFluidList(node: Node): FlowOp[] {
  const out: FlowOp[] = [];
  if (node.type === 'ArrayExpression') {
    for (const el of node.elements) {
      if (!el || el.type === 'SpreadElement') continue;
      out.push(...parseFluidArg(el));
    }
  } else {
    out.push(...parseFluidArg(node));
  }
  return out;
}

function isGlobalModifyRecipe(call: import('@babel/types').CallExpression): boolean {
  const callee = call.callee;
  if (callee.type === 'MemberExpression' && callee.property.type === 'Identifier') {
    if (callee.property.name !== 'modifyRecipe') return false;
    if (callee.object.type === 'Identifier' && callee.object.name === 'global') return true;
  }
  return false;
}

function resolveNewIdFromForEachBody(
  patchObj: ObjectExpression,
  recipeId: string,
): string | undefined {
  for (const prop of patchObj.properties) {
    if (prop.type !== 'ObjectProperty') continue;
    const key = prop.key.type === 'Identifier' ? prop.key.name : undefined;
    if (key !== 'newId') continue;
    const val = prop.value;
    if (val.type === 'BinaryExpression' && val.operator === '+') {
      const left = stringLiteral(val.left);
      const right = val.right;
      if (left === 'tfg:' && right.type === 'CallExpression') {
        const fn = right.callee;
        if (fn.type === 'Identifier' && fn.name === 'linuxUnfucker' && right.arguments[0]) {
          const argId = stringLiteral(right.arguments[0]);
          if (argId) return `tfg:${unfuckGtId(argId)}`;
        }
      }
      if (left === 'tfg:') {
        return `tfg:${unfuckGtId(recipeId)}`;
      }
    }
  }
  return undefined;
}

function extractModifyRecipeCall(
  call: import('@babel/types').CallExpression,
  source: string,
  recipeIdOverride?: string,
): RecipePatch | null {
  const recipeId = recipeIdOverride ?? stringLiteral(call.arguments[1]);
  if (!recipeId) return null;

  const patchNode = call.arguments[2];
  const partial = parsePatchObject(patchNode);
  const resolvedId = recipeId.includes(':') ? recipeId : `gtceu:${recipeId}`;

  let newId = partial.newId;
  if (!newId && patchNode?.type === 'ObjectExpression') {
    newId = resolveNewIdFromForEachBody(patchNode, resolvedId);
  }

  return {
    recipeId: resolvedId,
    newId,
    durationTicks: partial.durationTicks,
    replaceItemInputs: partial.replaceItemInputs,
    replaceItemOutputs: partial.replaceItemOutputs,
    replaceInputFluids: partial.replaceInputFluids,
    replaceOutputFluids: partial.replaceOutputFluids,
    fluidOutputAmounts: partial.fluidOutputAmounts,
    source,
    line: call.loc?.start.line,
  };
}

function literalStringArray(node: Node | undefined): string[] {
  if (!node || node.type !== 'ArrayExpression') return [];
  const ids: string[] = [];
  for (const el of node.elements) {
    const s = el && el.type !== 'SpreadElement' ? stringLiteral(el) : undefined;
    if (s) ids.push(s.includes(':') ? s : `gtceu:${s}`);
  }
  return ids;
}

/** Expand modifyRecipes([...ids], duration) helper from early_gas.js. */
function findModifyRecipesCalls(ast: File, source: string): RecipePatch[] {
  const patches: RecipePatch[] = [];

  traverse(ast, {
    CallExpression(path) {
      const callee = path.node.callee;
      if (callee.type !== 'Identifier' || callee.name !== 'modifyRecipes') return;
      const ids = literalStringArray(path.node.arguments[0]);
      const duration = evalNumeric(path.node.arguments[1]);
      if (ids.length === 0 || duration === undefined) return;

      for (const id of ids) {
        patches.push({
          recipeId: id,
          newId: `tfg:${unfuckGtId(id)}`,
          durationTicks: duration,
          source,
          line: path.node.loc?.start.line,
        });
      }
    },
  });

  return patches;
}

/** Expand ['id1','id2'].forEach(id => global.modifyRecipe(...)). */
function findLiteralForEachPatches(ast: File, source: string): RecipePatch[] {
  const patches: RecipePatch[] = [];

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
      const ids = literalStringArray(arr);
      if (ids.length === 0) return;

      const callback = path.node.arguments[0];
      if (!callback || callback.type !== 'ArrowFunctionExpression') return;

      const body = callback.body;
      if (body.type !== 'BlockStatement') return;

      for (const stmt of body.body) {
        if (stmt.type !== 'ExpressionStatement' || stmt.expression.type !== 'CallExpression') continue;
        const inner = stmt.expression;
        if (!isGlobalModifyRecipe(inner)) continue;

        for (const id of ids) {
          const patch = extractModifyRecipeCall(inner, source, id);
          if (patch) patches.push(patch);
        }
      }
    },
  });

  return patches;
}

export function findRecipePatches(ast: File, source: string): RecipePatch[] {
  const patches: RecipePatch[] = [];
  const seen = new Set<string>();

  const push = (p: RecipePatch) => {
    const key = `${p.recipeId}|${p.newId ?? ''}|${p.durationTicks ?? ''}|${p.line ?? ''}`;
    if (seen.has(key)) return;
    seen.add(key);
    patches.push(p);
  };

  traverse(ast, {
    CallExpression(path) {
      if (!isGlobalModifyRecipe(path.node)) return;
      const patch = extractModifyRecipeCall(path.node, source);
      if (patch) push(patch);
    },
  });

  for (const p of findModifyRecipesCalls(ast, source)) push(p);
  for (const p of findLiteralForEachPatches(ast, source)) push(p);

  return patches;
}

export function buildCircuitPatchesFromGlobals(globals: StartupGlobals): RecipePatch[] {
  return getCircuitEntries(globals).map(({ recipeId, circuitNumber }) => ({
    recipeId,
    circuitConfiguration: circuitNumber,
    source: 'globals:ADD_CIRCUIT',
  }));
}

function globalForEachKey(node: Node): string | undefined {
  if (node.type !== 'MemberExpression') return undefined;
  if (node.object.type !== 'Identifier' || node.object.name !== 'global') return undefined;
  if (node.property.type !== 'Identifier') return undefined;
  return node.property.name;
}

/** Suppress warnings for `global.ADD_CIRCUIT.forEach` handled via startup globals. */
export function findAddCircuitForEachLines(ast: File): Set<number> {
  const lines = new Set<number>();
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
      if (globalForEachKey(callee.object) !== 'ADD_CIRCUIT') return;
      const line = path.node.loc?.start.line;
      if (line) lines.add(line);
    },
  });
  return lines;
}
