import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { emptyLangBundle, mergeLangBundle } from './merge.js';
import type { LangBundle } from './types.js';

function walkLangFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      walkLangFiles(path, acc);
    } else if (entry.name === 'ru_ru.json' || entry.name === 'en_us.json') {
      acc.push(path);
    }
  }
  return acc;
}

function parseLangFile(path: string): Record<string, string> | null {
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as Record<string, string>;
  } catch {
    return null;
  }
}

/** Load kubejs/assets lang files from modpack snapshot (highest-priority overrides). */
export function loadKubeJsLang(modpackRoot: string): { bundle: LangBundle; fileCount: number } {
  const assetsRoot = join(modpackRoot, 'kubejs', 'assets');
  const bundle = emptyLangBundle();
  let fileCount = 0;

  try {
    const files = walkLangFiles(assetsRoot);
    fileCount = files.length;
    for (const file of files) {
      const parsed = parseLangFile(file);
      if (!parsed) continue;
      if (file.endsWith('ru_ru.json')) {
        mergeLangBundle(bundle, { ru: parsed, en: {} });
      } else {
        mergeLangBundle(bundle, { ru: {}, en: parsed });
      }
    }
  } catch {
    /* kubejs/assets may be absent */
  }

  return { bundle, fileCount };
}
