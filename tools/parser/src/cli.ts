/**
 * CLI for TFG-Modern pack builder and validator.
 *
 * Usage:
 *   npm run build-pack -- --tag 0.12.8
 *   npm run build-pack -- --tag 0.12.8 --no-strict-snapshot
 *   npm run parser:validate -- --pack public/data/packs/0.12.8/pack.json
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
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
  const args: Args = { command: argv[0] ?? 'help', strictSnapshot: true };
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--tag') args.tag = argv[++i];
    else if (a === '--cache') args.cache = argv[++i];
    else if (a === '--out') args.out = argv[++i];
    else if (a === '--pack') args.pack = argv[++i];
    else if (a === '--snapshot-dir') args.snapshotDir = argv[++i];
    else if (a === '--strict-snapshot') args.strictSnapshot = true;
    else if (a === '--no-strict-snapshot') args.strictSnapshot = false;
  }
  return args;
}

function requireSnapshotRecipes(tag: string, snapshotDir: string): void {
  const recipesPath = join(snapshotDir, 'recipes.json');
  if (existsSync(recipesPath)) return;
  throw new Error(
    `Recipe snapshot missing at ${recipesPath}.\n` +
      `Production pack data requires in-game export:\n` +
      `  npm run generate-tfg-snapshot -- ${tag}\n` +
      `See tools/parser/snapshots/README.md`,
  );
}

async function cmdBuildPack(args: Args): Promise<void> {
  const tag = args.tag ?? '0.12.8';
  const cacheDir = resolve(args.cache ?? '.cache');
  const outDir = resolve(args.out ?? `public/data/packs/${tag}`);
  const snapshotDir = args.snapshotDir
    ? resolve(args.snapshotDir)
    : join(__dirname, '..', 'snapshots', tag);

  requireSnapshotRecipes(tag, snapshotDir);

  console.log(`Building pack for tag ${tag} (server snapshot only)…`);
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
  build-pack   Build pack.json from server recipe snapshot + lang bundle
  validate     Validate existing pack.json and write build-report.json

Options:
  --tag <ver>              Modpack release tag (default: 0.12.8)
  --cache <dir>            Cache directory (default: .cache)
  --out <dir>              Output directory (default: public/data/packs/<tag>)
  --pack <path>            Pack file for validate
  --snapshot-dir <dir>     Override tools/parser/snapshots/<tag>
  --strict-snapshot        Fail if snapshot manifest or smoke chains invalid (default)
  --no-strict-snapshot     Allow build with smoke/manifest warnings

Recipe source: server snapshot only (npm run generate-tfg-snapshot).
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
