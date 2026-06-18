import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import traverse from '@babel/traverse';
import type { ArrayExpression, Node, ObjectExpression } from '@babel/types';
import { listStartupScripts } from './scanner.js';
import { parseKubeJs } from './ast/parse.js';
import { evalNumeric, stringLiteral } from './ast/expr.js';

export interface GlobalObjectRow {
  [key: string]: string | number | boolean | null;
}

export type GlobalValue = string[] | GlobalObjectRow[];

export type StartupGlobals = Record<string, GlobalValue>;

export interface CircuitEntry {
  recipeId: string;
  circuitNumber: number;
}

function parseObjectRow(node: ObjectExpression): GlobalObjectRow | undefined {
  const row: GlobalObjectRow = {};
  for (const prop of node.properties) {
    if (prop.type !== 'ObjectProperty') continue;
    const key =
      prop.key.type === 'Identifier'
        ? prop.key.name
        : prop.key.type === 'StringLiteral'
          ? prop.key.value
          : undefined;
    if (!key) continue;
    const str = stringLiteral(prop.value);
    if (str !== undefined) {
      row[key] = str;
      continue;
    }
    const num = evalNumeric(prop.value);
    if (num !== undefined) {
      row[key] = num;
      continue;
    }
    if (prop.value.type === 'NullLiteral') {
      row[key] = null;
    }
  }
  return Object.keys(row).length > 0 ? row : undefined;
}

function parseArrayValue(node: Node | undefined): GlobalValue | undefined {
  if (!node || node.type !== 'ArrayExpression') return undefined;
  const strings: string[] = [];
  const objects: GlobalObjectRow[] = [];
  let mode: 'unknown' | 'string' | 'object' = 'unknown';

  for (const el of node.elements) {
    if (!el || el.type === 'SpreadElement') continue;
    const str = stringLiteral(el);
    if (str !== undefined) {
      if (mode === 'object') return undefined;
      mode = 'string';
      strings.push(str);
      continue;
    }
    if (el.type === 'ObjectExpression') {
      if (mode === 'string') return undefined;
      const row = parseObjectRow(el);
      if (!row) return undefined;
      mode = 'object';
      objects.push(row);
    }
  }

  if (mode === 'string') return strings;
  if (mode === 'object') return objects;
  return undefined;
}

function parseGlobalAssignments(ast: NonNullable<ReturnType<typeof parseKubeJs>>): StartupGlobals {
  const globals: StartupGlobals = {};

  traverse(ast, {
    AssignmentExpression(path) {
      const left = path.node.left;
      if (
        left.type !== 'MemberExpression' ||
        left.object.type !== 'Identifier' ||
        left.object.name !== 'global' ||
        left.property.type !== 'Identifier'
      ) {
        return;
      }
      const name = left.property.name;
      const value = parseArrayValue(path.node.right);
      if (value) globals[name] = value;
    },
  });

  return globals;
}

export function parseStartupGlobals(startupRoot: string): StartupGlobals {
  const merged: StartupGlobals = {};
  for (const file of listStartupScripts(startupRoot)) {
    const source = readFileSync(file, 'utf-8');
    const ast = parseKubeJs(source, file);
    if (!ast) continue;
    Object.assign(merged, parseGlobalAssignments(ast));
  }
  return merged;
}

export function getCircuitEntries(globals: StartupGlobals): CircuitEntry[] {
  const raw = globals.ADD_CIRCUIT;
  if (!raw || !Array.isArray(raw) || raw.length === 0) return [];
  if (typeof raw[0] === 'string') return [];
  const out: CircuitEntry[] = [];
  for (const row of raw as GlobalObjectRow[]) {
    const recipeId = row.recipeId;
    const circuitNumber = row.circuitNumber;
    if (typeof recipeId !== 'string' || typeof circuitNumber !== 'number') continue;
    out.push({ recipeId, circuitNumber });
  }
  return out;
}

export function globalStringList(globals: StartupGlobals, key: string): string[] | undefined {
  const v = globals[key];
  if (!v || !Array.isArray(v) || v.length === 0) return undefined;
  if (typeof v[0] !== 'string') return undefined;
  return v as string[];
}

export function globalObjectList(globals: StartupGlobals, key: string): GlobalObjectRow[] | undefined {
  const v = globals[key];
  if (!v || !Array.isArray(v) || v.length === 0) return undefined;
  if (typeof v[0] === 'string') return undefined;
  return v as GlobalObjectRow[];
}
