import traverse from '@babel/traverse';
import type { Node, CallExpression, File } from '@babel/types';
import type { NodePath } from '@babel/traverse';
import type { FlowOp, EnergyOp } from '../../../types.js';
import { evalNumeric, stringLiteral } from '../expr.js';
import { fluidStringToFlow, itemStringToFlow } from '../flow-parse.js';
function parseItemArg(node: Node): FlowOp[] {
  const s = stringLiteral(node);
  if (s) return [itemStringToFlow(s)];
  if (node.type === 'ArrayExpression') {
    const out: FlowOp[] = [];
    for (const el of node.elements) {
      if (!el || el.type === 'SpreadElement') continue;
      out.push(...parseItemArg(el));
    }
    return out;
  }
  if (node.type === 'CallExpression') {
    const callee = node.callee;
    if (callee.type === 'MemberExpression' && callee.property.type === 'Identifier') {
      const method = callee.property.name;
      if (method === 'of' && node.arguments[0]) {
        const id = stringLiteral(node.arguments[0]);
        const amount =
          node.arguments[1] && evalNumeric(node.arguments[1]) !== undefined
            ? (evalNumeric(node.arguments[1]) as number)
            : 1;
        if (id) return [{ itemId: id, amount }];
      }
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
  if (node.type === 'ArrayExpression') {
    const out: FlowOp[] = [];
    for (const el of node.elements) {
      if (!el || el.type === 'SpreadElement') continue;
      out.push(...parseFluidArg(el));
    }
    return out;
  }
  return [];
}

function parseEnergyArg(node: Node): EnergyOp | undefined {
  const n = evalNumeric(node);
  if (n !== undefined) return { euPerTick: n };
  return undefined;
}

function isGtceuRecipesCall(node: CallExpression): { machineType: string; recipeId: string } | null {
  const callee = node.callee;
  if (callee.type !== 'MemberExpression') return null;
  const cur = callee;
  if (
    cur.object.type === 'MemberExpression' &&
    cur.object.property.type === 'Identifier' &&
    cur.object.property.name === 'gtceu' &&
    cur.object.object.type === 'MemberExpression' &&
    cur.object.object.property.type === 'Identifier' &&
    cur.object.object.property.name === 'recipes' &&
    cur.property.type === 'Identifier'
  ) {
    const machineType = cur.property.name;
    const recipeId = stringLiteral(node.arguments[0]);
    if (!recipeId) return null;
    return { machineType, recipeId };
  }
  return null;
}

function findHeadCall(start: CallExpression): CallExpression | null {
  let cur: Node = start;
  while (cur.type === 'CallExpression') {
    if (isGtceuRecipesCall(cur)) return cur;
    if (cur.callee.type === 'MemberExpression') {
      cur = cur.callee.object;
    } else {
      break;
    }
  }
  return null;
}

function findTopCall(path: NodePath<CallExpression>): CallExpression {
  let current: NodePath<CallExpression> = path;
  while (
    current.parentPath?.isCallExpression() &&
    current.parentPath.node.callee.type === 'MemberExpression' &&
    current.parentPath.node.callee.object === current.node
  ) {
    current = current.parentPath;
  }
  return current.node;
}

export interface GtceuRecipeDraft {
  id: string;
  machineId: string;
  inputs: FlowOp[];
  outputs: FlowOp[];
  durationTicks: number;
  energy?: EnergyOp;
}

export function extractGtceuChain(start: CallExpression): GtceuRecipeDraft | null {
  const head = findHeadCall(start);
  if (!head) return null;
  const meta = isGtceuRecipesCall(head);
  if (!meta) return null;

  const draft: GtceuRecipeDraft = {
    id: meta.recipeId.includes(':') ? meta.recipeId : `gtceu:${meta.recipeId}`,
    machineId: `gtceu:${meta.machineType}`,
    inputs: [],
    outputs: [],
    durationTicks: 0,
  };

  let cur: Node = start;
  while (cur.type === 'CallExpression') {
    const call: CallExpression = cur;
    const prop =
      call.callee.type === 'MemberExpression' && call.callee.property.type === 'Identifier'
        ? call.callee.property.name
        : null;
    const args = call.arguments.filter((a) => a.type !== 'SpreadElement') as Node[];

    switch (prop) {
      case 'itemInputs':
        for (const a of args) draft.inputs.push(...parseItemArg(a));
        break;
      case 'inputFluids':
        for (const a of args) draft.inputs.push(...parseFluidArg(a));
        break;
      case 'itemOutputs':
        for (const a of args) draft.outputs.push(...parseItemArg(a));
        break;
      case 'outputFluids':
        for (const a of args) draft.outputs.push(...parseFluidArg(a));
        break;
      case 'duration': {
        const d = evalNumeric(args[0]);
        if (d !== undefined) draft.durationTicks = d;
        break;
      }
      case 'chancedOutput': {
        const s = stringLiteral(args[0]);
        if (s) draft.outputs.push(itemStringToFlow(s));
        break;
      }      case 'EUt': {
        const e = parseEnergyArg(args[0]);
        if (e) draft.energy = e;
        break;
      }
      default:
        break;
    }

    if (call.callee.type === 'MemberExpression') {
      cur = call.callee.object;
    } else {
      break;
    }
  }

  if (draft.outputs.length === 0 && draft.inputs.length === 0) return null;
  if (draft.durationTicks === 0) draft.durationTicks = 20;
  return draft;
}

export function findGtceuRecipeCalls(ast: File): GtceuRecipeDraft[] {
  const results: GtceuRecipeDraft[] = [];
  const seen = new Set<string>();

  traverse(ast, {
    CallExpression(path) {
      const head = findHeadCall(path.node);
      if (!head) return;
      const top = findTopCall(path);
      if (top !== path.node) return;
      const draft = extractGtceuChain(path.node);
      if (draft && !seen.has(draft.id)) {
        seen.add(draft.id);
        results.push(draft);
      }
    },
  });
  return results;
}
