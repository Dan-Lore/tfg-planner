#!/usr/bin/env node
/**
 * Run semgrep with CI args; resolve binary on Windows when not in PATH.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const args = ['--config', '.semgrep.yml', '--error', '--quiet', 'src', 'tools/parser/src'];

function semgrepCandidates() {
  const list = ['semgrep'];
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming');
    for (const ver of ['Python311', 'Python312', 'Python313']) {
      list.push(join(appData, 'Python', ver, 'Scripts', 'semgrep.exe'));
    }
  }
  return list;
}

function run(cmd) {
  return spawnSync(cmd, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32' && !cmd.endsWith('.exe'),
  });
}

for (const cmd of semgrepCandidates()) {
  if (cmd.endsWith('.exe') && !existsSync(cmd)) continue;
  const result = run(cmd);
  if (result.error?.code === 'ENOENT') continue;
  process.exit(result.status ?? 1);
}

console.error(
  'semgrep not found. Install: pip install semgrep (Linux CI) or winget install GitHub.cli / pip on Windows.',
);
process.exit(1);
