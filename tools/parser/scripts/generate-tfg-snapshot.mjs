#!/usr/bin/env node
/**
 * Cross-platform entry for TFG recipe snapshot export (full modpack server).
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const tag = process.argv[2] ?? '0.12.8';
const skipFetch = process.argv.includes('--skip-fetch');
const isWin = process.platform === 'win32';

if (isWin) {
  const ps1 = join(__dirname, 'generate-tfg-snapshot.ps1');
  const args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ps1, '-Tag', tag];
  if (skipFetch) args.push('-SkipFetch');
  const r = spawnSync('powershell', args, { stdio: 'inherit' });
  process.exit(r.status ?? 1);
} else {
  const sh = join(__dirname, 'generate-tfg-snapshot.sh');
  const shArgs = skipFetch ? [tag, '--skip-fetch'] : [tag];
  const r = spawnSync('bash', [sh, ...shArgs], { stdio: 'inherit' });
  process.exit(r.status ?? 1);
}
