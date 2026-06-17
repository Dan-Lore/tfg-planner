import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import AdmZip from 'adm-zip';

/** Load recipe ids listed in tfg_excludes.zip (internal substrate filter). */
export function loadTfgExcludes(modpackRoot: string): Set<string> {
  const zipPath = join(modpackRoot, 'kubejs', 'data', 'tfg_excludes.zip');
  const excluded = new Set<string>();
  try {
    const zip = new AdmZip(readFileSync(zipPath));
    for (const entry of zip.getEntries()) {
      if (entry.isDirectory || !entry.entryName.endsWith('.json')) continue;
      const text = entry.getData().toString('utf-8');
      try {
        const data = JSON.parse(text) as { remove?: string[]; ids?: string[] };
        for (const id of data.remove ?? data.ids ?? []) {
          excluded.add(id);
        }
        if (Array.isArray(data)) {
          for (const id of data) excluded.add(String(id));
        }
      } catch {
        for (const line of text.split('\n')) {
          const t = line.trim();
          if (t && !t.startsWith('#')) excluded.add(t);
        }
      }
    }
  } catch {
    /* zip optional */
  }
  return excluded;
}

export function filterExcluded(recipeIds: string[], excluded: Set<string>): string[] {
  return recipeIds.filter((id) => !excluded.has(id));
}
