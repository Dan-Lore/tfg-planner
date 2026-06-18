/**
 * CLI for TFG-Modern pack builder and validator.
 *
 * Usage:
 *   npm run build-pack -- --tag 0.12.8
 *   npm run build-pack -- --tag 0.12.8 --strict-snapshot
 *   npm run parser:validate -- --pack public/data/packs/0.12.8/pack.json
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPack } from './build-pack.js';
import { buildReportFromPack } from './validate/schema.js';
import type { PackData } from '../../../src/data/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

interface Args {
  command: string;
  tag?: string;
  cache?: string;
  out?: string;
  pack?: string;
  snapshotDir?: string;
  strictSnapshot?: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { command: argv[0] ?? 'help' };
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--tag') args.tag = argv[++i];
    else if (a === '--cache') args.cache = argv[++i];
    else if (a === '--out') args.out = argv[++i];
    else if (a === '--pack') args.pack = argv[++i];
    else if (a === '--snapshot-dir') args.snapshotDir = argv[++i];
    else if (a === '--strict-snapshot') args.strictSnapshot = true;
  }
  return args;
}

function ensureSnapshotRecipes(tag: string, snapshotDir: string, packPath: string): void {
  const recipesPath = join(snapshotDir, 'recipes.json');
  if (existsSync(recipesPath) || !existsSync(packPath)) return;

  console.log(`Snapshot recipes missing; bootstrapping from ${packPath}…`);
  const script = join(__dirname, '..', 'scripts', 'bootstrap-snapshot-from-pack.mjs');
  const r = spawnSync(process.execPath, [script, tag, packPath], { stdio: 'inherit' });
  if (r.status !== 0) {
    throw new Error(`bootstrap-snapshot failed (exit ${r.status ?? 1})`);
  }
}

async function cmdBuildPack(args: Args): Promise<void> {
  const tag = args.tag ?? '0.12.8';
  const cacheDir = resolve(args.cache ?? '.cache');
  const outDir = resolve(args.out ?? `public/data/packs/${tag}`);
  const snapshotDir = args.snapshotDir
    ? resolve(args.snapshotDir)
    : join(__dirname, '..', 'snapshots', tag);
  const packPath = join(outDir, 'pack.json');

  ensureSnapshotRecipes(tag, snapshotDir, packPath);

  console.log(`Building pack for tag ${tag} (snapshot pipeline)…`);
  const result = await buildPack({
    tag,
    cacheDir,
    outDir,
    snapshotDir: args.snapshotDir ? resolve(args.snapshotDir) : undefined,
    strictSnapshot: args.strictSnapshot,
    goldenPath: join(__dirname, '..', 'golden', `${tag}.json`),
  });

  console.log(`Pack:   ${result.packPath} (${result.report.stats.finalRecipes} recipes)`);
  console.log(`Report: ${result.reportPath}`);
  if (result.report.warnings.length > 0) {
    console.log(`Warnings: ${result.report.warnings.length}`);
  }
}

function cmdValidate(args: Args): void {
  const packPath = resolve(
    args.pack ?? 'public/data/packs/0.12.8-sample/pack.json',
  );
  const raw = readFileSync(packPath, 'utf-8');
  const pack = JSON.parse(raw) as PackData;

  const report = buildReportFromPack(pack, pack.modpackVersion);
  const outPath = packPath.replace(/pack\.json$/, 'build-report.json');
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`Pack OK: ${packPath}`);
  console.log(`Report: ${outPath}`);
}

function printHelp(): void {
  console.log(`TFG-Modern parser CLI

Commands:
  build-pack   Build pack.json from recipe snapshot + lang bundle
  validate     Validate existing pack.json and write build-report.json

Options:
  --tag <ver>           Modpack release tag (default: 0.12.8)
  --cache <dir>         Cache directory (default: .cache)
  --out <dir>           Output directory (default: public/data/packs/<tag>)
  --pack <path>         Pack file for validate
  --snapshot-dir <dir>  Override tools/parser/snapshots/<tag>
  --strict-snapshot     Fail if snapshot manifest or smoke chains invalid
`);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const cmd = argv[0] ?? 'help';
  const args = parseArgs(argv);

  switch (cmd) {
    case 'build-pack':
      await cmdBuildPack(args);
      break;
    case 'validate':
    case 'parser:validate':
      cmdValidate(args);
      break;
    default:
      printHelp();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
