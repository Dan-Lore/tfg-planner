import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import AdmZip from 'adm-zip';
import type { ModIndex } from '../types.js';
import type { RecipeOp } from '../types.js';
import { findMod } from '../lockfile/parse-pakku.js';
import { downloadFile } from '../fetch/modpack-fetch.js';

interface GtJarRecipeValue {
  type?: string;
  duration?: number;
  inputs?: Record<string, unknown>;
  outputs?: Record<string, unknown>;
}

function flowsFromSide(side: unknown): RecipeOp['inputs'] {
  const flows: RecipeOp['inputs'] = [];
  if (!side || typeof side !== 'object') return flows;
  const obj = side as { item?: unknown[]; fluid?: unknown[] };
  for (const list of [obj.item, obj.fluid]) {
    if (!Array.isArray(list)) continue;
    for (const entry of list) {
      if (!entry || typeof entry !== 'object') continue;
      const e = entry as { content?: { item?: string; fluid?: string; amount?: number } };
      const c = e.content;
      if (!c) continue;
      if (c.item) flows.push({ itemId: c.item, amount: c.amount ?? 1 });
      if (c.fluid) flows.push({ fluidId: c.fluid, amount: c.amount ?? 1 });
    }
  }
  return flows;
}

function parseRecipeJson(id: string, data: GtJarRecipeValue, source: string): RecipeOp | null {
  const type = data.type ?? '';
  const m = type.match(/gtceu:([^/]+)/);
  const machineId = m ? `gtceu:${m[1]}` : 'gtceu:unknown';
  const inputs = flowsFromSide(data.inputs);
  const outputs = flowsFromSide(data.outputs);
  if (inputs.length === 0 && outputs.length === 0) return null;
  return {
    id: id.includes(':') ? id : `gtceu:${id}`,
    machineId,
    inputs,
    outputs,
    durationTicks: data.duration ?? 20,
    source,
  };
}

/** Internal substrate — never exported directly; merged through pipeline. */
export async function loadGtceuSubstrate(
  modIndex: ModIndex,
  cacheDir: string,
): Promise<{ recipes: RecipeOp[]; jarPath?: string; warning?: string }> {
  const gt = findMod(modIndex, /gtceu-1\.20\.1/i);
  if (!gt) {
    return { recipes: [], warning: 'GTCEu mod not found in pakku-lock index' };
  }

  const jarDir = join(cacheDir, 'mods');
  mkdirSync(jarDir, { recursive: true });
  const jarPath = join(jarDir, gt.fileName);

  try {
    await downloadFile(gt.url, jarPath);
  } catch (e) {
    return {
      recipes: [],
      warning: `Failed to download GTCEu JAR: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  if (!existsSync(jarPath)) {
    return { recipes: [], warning: 'GTCEu JAR missing after download' };
  }

  const recipes: RecipeOp[] = [];
  const zip = new AdmZip(jarPath);

  for (const entry of zip.getEntries()) {
    const name = entry.entryName.replace(/\\/g, '/');
    if (!name.includes('/recipe/') || !name.endsWith('.json')) continue;
    try {
      const raw = JSON.parse(entry.getData().toString('utf-8')) as Record<string, GtJarRecipeValue>;
      for (const [key, val] of Object.entries(raw)) {
        const id = key.includes(':') ? key : `gtceu:${key}`;
        const r = parseRecipeJson(id, val, `jar:${name}`);
        if (r) recipes.push(r);
      }
    } catch {
      /* skip */
    }
  }

  return { recipes, jarPath };
}
