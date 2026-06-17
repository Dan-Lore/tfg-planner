import fs from 'node:fs';
import path from 'node:path';
import { resolveResourceName } from '../src/lang/resolve-name.js';
import { buildLangBundle } from '../src/lang/build-lang-bundle.js';
import { buildModIndex } from '../src/lockfile/parse-pakku.js';

const cacheRoot = path.join(import.meta.dirname, '..', '..', '..', '.cache');
const modpackRoot = fs
  .readdirSync(path.join(cacheRoot, 'modpack'))
  .map((e) => path.join(cacheRoot, 'modpack', e, 'Modpack-Modern-0.12.8'))
  .find((p) => fs.existsSync(p));

if (!modpackRoot) throw new Error('modpack not cached');

const modIndex = buildModIndex(modpackRoot, '0.12.8');
const { bundle, stats } = await buildLangBundle(modpackRoot, modIndex, cacheRoot, {
  downloadModJars: false,
});

const pack = JSON.parse(
  fs.readFileSync(
    path.join(import.meta.dirname, '..', '..', '..', 'public/data/packs/0.12.8/pack.json'),
    'utf-8',
  ),
);

function fallbackLabel(id: string): string {
  const base = id.startsWith('#') ? id.slice(1) : id.includes(':') ? id.split(':')[1]! : id;
  return (base ?? id).replace(/[/_.]/g, ' ');
}

const all = [...pack.items, ...pack.fluids];
const miss = all.filter((x) => resolveResourceName(x.id, bundle).ru === fallbackLabel(x.id));

console.log('lang stats:', stats);
console.log('untranslated:', miss.length, '/', all.length);

const tests = [
  'gtceu:aluminium_quadruple_cable',
  'gtceu:copper_large_fluid_pipe',
  'gtceu:chipped_certus_quartz_gem',
  'minecraft:arrow',
  'minecraft:water',
  '#ae2:glass_cable',
  '#forge:aerogels',
  '#forge:tiny_dusts/uranium_235',
  'tfg:abs_bismuth_bronze',
];
for (const id of tests) {
  const r = resolveResourceName(id, bundle);
  const isFb = r.ru === fallbackLabel(id);
  console.log(id, '->', r.ru, isFb ? '(fallback)' : '');
}

for (const id of ['#ae2:glass_cable', '#forge:aerogels', '#forge:tiny_dusts/uranium_235']) {
  const body = id.slice(1);
  const colon = body.indexOf(':');
  const ns = body.slice(0, colon);
  const rest = body.slice(colon + 1);
  const dot = rest.replace(/\//g, '.');
  const keys = [
    `tag.item.${ns}.${dot}`,
    `tag.item.c.${dot}`,
    `tag.item.forge.${dot}`,
    `tag.item.${ns.replace(/\//g, '.')}.${dot}`,
  ];
  console.log(
    'tag keys for',
    id,
    keys.filter((k) => bundle.ru[k]).map((k) => [k, bundle.ru[k]]),
  );
}

// GTCEu prefix check
const prefixes = ['cable_gt_quadruple', 'pipe_large', 'wire_double', 'chipped_gem'];
for (const p of prefixes) {
  console.log('tagprefix.' + p, bundle.ru['tagprefix.' + p]);
}
