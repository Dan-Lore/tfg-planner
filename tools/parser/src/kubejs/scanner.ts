import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const PRIORITY_DIRS = ['gregtech', 'tfg', 'tfc', 'greate', 'create'];

export function listKubeJsFiles(serverScriptsRoot: string): string[] {
  const priority: string[] = [];
  const rest: string[] = [];

  function walk(dir: string, rel: string): void {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of entries) {
      const full = join(dir, name);
      const relPath = rel ? `${rel}/${name}` : name;
      const st = statSync(full);
      if (st.isDirectory()) {
        walk(full, relPath);
      } else if (name.endsWith('.js')) {
        rest.push(full);
      }
    }
  }

  walk(serverScriptsRoot, '');

  for (const dir of PRIORITY_DIRS) {
    const sub = join(serverScriptsRoot, dir);
    try {
      statSync(sub);
    } catch {
      continue;
    }
    const files: string[] = [];
    function walkPriority(d: string): void {
      for (const name of readdirSync(d)) {
        const full = join(d, name);
        if (statSync(full).isDirectory()) walkPriority(full);
        else if (name.endsWith('.js')) files.push(full);
      }
    }
    walkPriority(sub);
    priority.push(...files);
  }

  const prioritySet = new Set(priority);
  const ordered = [...priority, ...rest.filter((f) => !prioritySet.has(f))];
  return [...new Set(ordered)];
}

export function listStartupScripts(startupRoot: string): string[] {
  const files: string[] = [];
  function walk(dir: string): void {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (name.endsWith('.js')) files.push(full);
    }
  }
  try {
    walk(startupRoot);
  } catch {
    /* missing */
  }
  return files;
}
