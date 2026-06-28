import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { parseTfgp } from '@/schema/tfgp';
import type { PackData } from '@/data/types';
import { checkScheme, formatSchemeCheckReport } from '@/scheme-check/check-scheme';

function usage(): never {
  console.error('Usage: npm run check-scheme -- <file.tfgp> [--json]');
  process.exit(2);
}

function loadPack(version: string): PackData {
  const packPath = path.join('public', 'data', 'packs', version, 'pack.json');
  if (!existsSync(packPath)) {
    console.error(`Pack data not found: ${packPath}`);
    process.exit(1);
  }
  return JSON.parse(readFileSync(packPath, 'utf8')) as PackData;
}

const args = process.argv.slice(2);
if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
  usage();
}

const jsonMode = args.includes('--json');
const schemePath = args.find((a) => !a.startsWith('--'));
if (!schemePath) {
  usage();
}

const resolved = path.resolve(schemePath);
const scheme = parseTfgp(readFileSync(resolved, 'utf8'));
const pack = loadPack(scheme.modpack.version);
const result = checkScheme(scheme, pack);

if (jsonMode) {
  console.log(
    JSON.stringify(
      result,
      (_key, value) => (typeof value === 'bigint' ? value.toString() : value),
      2,
    ),
  );
} else {
  console.log(formatSchemeCheckReport(result));
}

process.exit(result.ok ? 0 : 1);
