import { readFileSync } from 'node:fs';
import yaml from 'js-yaml';

export interface GtceuYamlFlags {
  disabledRecipeGenerators: string[];
  raw: Record<string, unknown>;
}

export function loadGtceuYaml(modpackRoot: string): GtceuYamlFlags {
  const path = `${modpackRoot}/config/gtceu.yaml`;
  const disabled: string[] = [];
  try {
    const doc = yaml.load(readFileSync(path, 'utf-8')) as Record<string, unknown>;
    const recipes = doc?.recipes as Record<string, unknown> | undefined;
    if (recipes && typeof recipes === 'object') {
      for (const [key, val] of Object.entries(recipes)) {
        if (val === false) disabled.push(key);
      }
    }
    const machines = doc?.machines as Record<string, unknown> | undefined;
    if (machines && typeof machines === 'object') {
      for (const [key, val] of Object.entries(machines)) {
        if (val === false) disabled.push(`machine:${key}`);
      }
    }
    return { disabledRecipeGenerators: disabled, raw: doc ?? {} };
  } catch {
    return { disabledRecipeGenerators: [], raw: {} };
  }
}
