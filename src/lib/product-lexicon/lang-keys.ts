import type { LangBundle } from './types';

export function fallbackName(id: string): { ru: string; en: string } {
  const base = id.startsWith('#') ? id.slice(1) : id.includes(':') ? id.split(':')[1]! : id;
  const label = base.replace(/[/_.]/g, ' ');
  return { ru: label, en: label };
}

export function isFallbackName(
  id: string,
  names: { ru: string; en: string },
): boolean {
  const fb = fallbackName(id);
  return names.ru === fb.ru && names.en === fb.en;
}

export function pickLang(
  bundle: LangBundle,
  keys: string[],
): { ru?: string; en?: string } {
  let ru: string | undefined;
  let en: string | undefined;
  for (const key of keys) {
    if (!ru && bundle.ru[key]) ru = bundle.ru[key];
    if (!en && bundle.en[key]) en = bundle.en[key];
    if (ru && en) break;
  }
  return { ru, en };
}

export function langKeysForResource(id: string): string[] {
  if (id.startsWith('#')) {
    const body = id.slice(1);
    const colon = body.indexOf(':');
    const ns = colon >= 0 ? body.slice(0, colon) : body;
    const rest = colon >= 0 ? body.slice(colon + 1) : '';
    const dot = rest.replace(/\//g, '.');
    const keys = [
      `tag.item.${ns}.${dot}`,
      `tag.fluid.${ns}.${dot}`,
      `tag.item.c.${dot}`,
      `tag.fluid.c.${dot}`,
      `tag.item.forge.${dot}`,
      `tag.fluid.forge.${dot}`,
      `tag.minecraft.${dot}`,
      `tag.${ns}.${dot}`,
    ];
    if (ns === 'ae2' || ns === 'tfc' || ns === 'tfg') {
      keys.push(`tag.item.${ns}.${rest}`, `tag.fluid.${ns}.${rest}`);
    }
    return keys;
  }

  if (!id.includes(':')) return [];
  const [ns, path] = id.split(':');
  const dot = path.replace(/\//g, '.');
  return [`item.${ns}.${dot}`, `fluid.${ns}.${dot}`, `block.${ns}.${dot}`];
}

/** All lang keys that resolveResourceName may consult for an id (for bundle pruning). */
export function collectLangKeysForResolve(id: string): string[] {
  const keys = new Set<string>(langKeysForResource(id));

  if (id.startsWith('#')) {
    const body = id.slice(1);
    const colon = body.indexOf(':');
    if (colon >= 0) {
      const ns = body.slice(0, colon);
      const rest = body.slice(colon + 1);
      const slash = rest.indexOf('/');
      if (slash >= 0) {
        const category = rest.slice(0, slash);
        const material = rest.slice(slash + 1);
        for (const kind of ['item', 'fluid'] as const) {
          keys.add(`tag.${kind}.${ns}.${category}`);
          keys.add(`tag.${kind}.forge.${category}`);
          keys.add(`tag.${kind}.c.${category}`);
        }
        for (const matNs of ['gtceu', 'tfg', ns]) {
          keys.add(`material.${matNs}.${material}`);
        }
      } else if (body.includes(':')) {
        for (const k of collectLangKeysForResolve(body)) keys.add(k);
      }
    }
  } else if (id.includes(':')) {
    const [ns, path] = id.split(':');
    if (ns === 'gtceu' || ns === 'tfg' || ns === 'greate') {
      keys.add(`material.${ns}.${path}`);
      keys.add(`material.tfg.${path}`);
      keys.add(`material.gtceu.${path}`);
    }
    if (ns === 'ae2' || ns === 'tfc' || ns === 'tfg') {
      keys.add(`item.${ns}.${path}`);
      keys.add(`block.${ns}.${path}`);
    }
  }

  return [...keys];
}
