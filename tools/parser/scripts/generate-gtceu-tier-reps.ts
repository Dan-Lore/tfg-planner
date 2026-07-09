/**
 * Generate gtceu-tier-representatives.json from pack meta tag members.
 * Usage: npx tsx --tsconfig tsconfig.app.json tools/parser/scripts/generate-gtceu-tier-reps.ts [tag]
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PackMeta } from '../../../src/data/types.js';
import { buildTagIndexFromMeta } from '../../../src/shared/tag-index.js';
import tierRepresentatives from '../../../src/shared/product-lexicon/gtceu-tier-representatives.json' with { type: 'json' };

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..', '..', '..');
const tag = process.argv[2] ?? '0.12.8';
const packDir = join(root, 'public/data/packs', tag);

const meta = JSON.parse(readFileSync(join(packDir, 'pack.meta.json'), 'utf8')) as PackMeta;
const tagIndex = buildTagIndexFromMeta({ items: meta.items, fluids: meta.fluids });
const tiers = ['ulv', 'lv', 'mv', 'hv', 'ev', 'iv', 'luv', 'zpm', 'uv'] as const;
const kinds = ['circuits', 'batteries'] as const;

const generated: Record<string, Record<string, string>> = {
  circuits: {},
  batteries: {},
};

for (const kind of kinds) {
  for (const tier of tiers) {
    const tagId = `#gtceu:${kind}/${tier}`;
    const memberSet = tagIndex.members.get(tagId);
    const members = memberSet ? [...memberSet] : [];
    const rep = members.find((m) => m.startsWith('gtceu:')) ?? members[0];
    if (rep) generated[kind][tier] = rep;
  }
}

const outApp = join(root, 'src/shared/product-lexicon/gtceu-tier-representatives.json');
const outTools = join(root, 'tools/parser/data/gtceu-tier-representatives.json');
mkdirSync(dirname(outTools), { recursive: true });

const json = `${JSON.stringify(generated, null, 2)}\n`;
writeFileSync(outApp, json);
writeFileSync(outTools, json);

let drift = 0;
for (const kind of kinds) {
  for (const tier of tiers) {
    const prev = (tierRepresentatives as Record<string, Record<string, string>>)[kind]?.[tier];
    const next = generated[kind][tier];
    if (prev && next && prev !== next) {
      console.warn(`drift ${kind}/${tier}: ${prev} -> ${next}`);
      drift++;
    }
  }
}

console.log('Wrote', outApp);
if (drift > 0) console.warn(`${drift} representative(s) differ from committed table — review before commit`);
