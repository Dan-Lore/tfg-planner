import { existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import AdmZip from 'adm-zip';
import { loadKubeJsLang } from '../src/lang/load-kubejs.js';
import { resolveResourceName, resolveMachineName } from '../src/lang/resolve-name.js';
import type { LangBundle } from '../src/lang/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const cacheRoot = join(__dirname, '..', '..', '..', '.cache');

function findModpackRoot(): string | null {
  const modpackDirs = join(cacheRoot, 'modpack');
  if (!existsSync(modpackDirs)) return null;
  for (const entry of readdirSync(modpackDirs)) {
    const candidate = join(modpackDirs, entry, 'Modpack-Modern-0.12.8');
    try {
      readdirSync(candidate);
      return candidate;
    } catch {
      /* try next */
    }
  }
  return null;
}

const modpackRoot = findModpackRoot();
const hasModpackCache =
  modpackRoot !== null && existsSync(join(cacheRoot, 'mods', 'gtceu-1.20.1-7.5.3.jar'));

describe('lang resolution', () => {
  it.skipIf(!hasModpackCache)(
    'resolves TFC and GTCEu names from modpack kubejs + gtceu jar',
    () => {
    const root = modpackRoot!;
    const { bundle: kubejs } = loadKubeJsLang(root);
    const zip = new AdmZip(join(cacheRoot, 'mods', 'gtceu-1.20.1-7.5.3.jar'));
    const gtRu = JSON.parse(zip.readAsText('assets/gtceu/lang/ru_ru.json'));
    const gtEn = JSON.parse(zip.readAsText('assets/gtceu/lang/en_us.json'));
    const bundle = {
      ru: { ...gtRu, ...kubejs.ru },
      en: { ...gtEn, ...kubejs.en },
    };

    expect(resolveResourceName('tfc:powder/flux', bundle).ru).toBe('Флюс');
    expect(resolveResourceName('gtceu:copper_dust', bundle).ru).toBe('Медь (Пыль)');
    expect(resolveResourceName('#forge:dusts/copper', bundle).ru).toBe('Пыль меди');
    expect(resolveMachineName('gtceu:mixer', bundle).ru).toBe('Миксер');
    expect(resolveMachineName('minecraft:smelting', bundle).ru).toBe('Плавка');
    },
  );

  it('resolves GTCEu cables via suffix aliases', () => {
    const bundle: LangBundle = {
      ru: {
        'tagprefix.cable_gt_quadruple': '4х кабель (%s)',
        'material.gtceu.aluminium': 'Алюминий',
      },
      en: {
        'tagprefix.cable_gt_quadruple': '4x %s Cable',
        'material.gtceu.aluminium': 'Aluminium',
      },
    };
    expect(resolveResourceName('gtceu:aluminium_quadruple_cable', bundle).ru).toBe(
      '4х кабель (Алюминий)',
    );
  });

  it('resolves TFG materials via material.tfg and tagprefix', () => {
    const bundle: LangBundle = {
      ru: {
        'material.tfg.activated_mo_si_b': 'Активированный сплав Mo-Si-B',
        'tagprefix.ingot': 'Слиток %s',
      },
      en: {
        'material.tfg.activated_mo_si_b': 'Activated Mo-Si-B Alloy',
        'tagprefix.ingot': '%s Ingot',
      },
    };
    expect(resolveResourceName('tfg:activated_mo_si_b_ingot', bundle).ru).toBe(
      'Слиток Активированный сплав Mo-Si-B',
    );
  });

  it('falls back tag to item lang key', () => {
    const bundle: LangBundle = {
      ru: { 'item.ae2.fluix_glass_cable': 'Кабель из флюиксового стекла' },
      en: { 'item.ae2.fluix_glass_cable': 'Fluix Glass Cable' },
    };
    expect(resolveResourceName('#ae2:fluix_glass_cable', bundle).ru).toBe(
      'Кабель из флюиксового стекла',
    );
  });

  it('resolves vanilla minecraft items', () => {
    const bundle: LangBundle = {
      ru: { 'item.minecraft.arrow': 'Стрела' },
      en: { 'item.minecraft.arrow': 'Arrow' },
    };
    expect(resolveResourceName('minecraft:arrow', bundle).ru).toBe('Стрела');
  });
});
