import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isFallbackName } from '../../../src/shared/product-lexicon/lang-keys.js';
import { classifyMissReason } from '../src/lang/lang-coverage-report.js';
import type { LangBundle } from '../../../src/shared/product-lexicon/types.js';

const tag = process.argv[2] ?? '0.12.8';
const packDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'public/data/packs', tag);
const art = JSON.parse(
  gunzipSync(readFileSync(join(packDir, 'pack.lang.json.gz'))).toString(),
) as {
  resolved: Record<string, { ru: string; en: string }>;
  bundle: LangBundle;
};

const byPrefix = new Map<string, string[]>();
const byReason = new Map<string, number>();

for (const [id, names] of Object.entries(art.resolved)) {
  if (!isFallbackName(id, names)) continue;
  const reason = classifyMissReason(id, art.bundle, names);
  byReason.set(reason, (byReason.get(reason) ?? 0) + 1);

  if (reason !== 'no_tag_member' || !id.startsWith('#')) continue;
  const body = id.slice(1);
  const slash = body.indexOf('/');
  const prefix = slash >= 0 ? body.slice(0, slash + 1) : body;
  const list = byPrefix.get(prefix) ?? [];
  if (list.length < 5) list.push(id);
  byPrefix.set(prefix, list);
}

console.log('miss by reason:', Object.fromEntries(byReason));
console.log('no_tag_member prefixes (top):');
for (const [prefix, samples] of [...byPrefix.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 15)) {
  console.log(`  ${prefix} (${samples.length} sample)`, samples.join(', '));
}
