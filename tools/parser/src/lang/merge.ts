import type { LangBundle } from './types.js';

export function emptyLangBundle(): LangBundle {
  return { ru: {}, en: {} };
}

export function mergeLangBundle(target: LangBundle, source: LangBundle): void {
  Object.assign(target.ru, source.ru);
  Object.assign(target.en, source.en);
}
