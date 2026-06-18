#!/usr/bin/env node
/**
 * Run TFG server from full pakku fetch workdir and export recipes.
 * Usage: node tools/parser/scripts/run-tfg-server-export.mjs 0.12.8
 */
import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  copyFileSync,
  readdirSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const tag = process.argv[2] ?? '0.12.8';
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const workDir = join(repoRoot, '.cache', 'tfg-snapshot', tag);
const outDir = join(repoRoot, 'tools', 'parser', 'snapshots', tag);
const exportScript = join(repoRoot, 'tools', 'parser', 'snapshot', 'kubejs-export-recipes.js');
const serverTimeoutMin = 120;
const minRecipes = 6000;

function resolveJava() {
  const candidates = [];
  if (process.env.JAVA_HOME) {
    candidates.push(join(process.env.JAVA_HOME, 'bin', 'java.exe'));
  }
  const roots = [
    'C:/Program Files/Microsoft',
    'C:/Program Files/Eclipse Adoptium',
    'C:/Program Files/Java',
  ];
  for (const root of roots) {
    if (!existsSync(root)) continue;
    for (const dir of readdirSync(root)) {
      if (/jdk-(21|17)/i.test(dir)) {
        candidates.push(join(root, dir, 'bin', 'java.exe'));
      }
    }
  }
  for (const java of candidates) {
    if (existsSync(java)) return java;
  }
  throw new Error('JDK 17+ not found. Install Temurin 21 and set JAVA_HOME.');
}

function copyServerStarterFiles() {
  const src = join(workDir, '.pakku', 'server-overrides');
  for (const name of [
    'minecraft_server.jar',
    'forge-auto-install.txt',
    'server_starter.conf',
    'server.properties',
    'start_server.bat',
    'start_server.sh',
  ]) {
    const from = join(src, name);
    if (existsSync(from)) copyFileSync(from, join(workDir, name));
  }
}

function patchForgeAutoInstall() {
  const lock = JSON.parse(readFileSync(join(workDir, 'pakku-lock.json'), 'utf-8'));
  const mc = lock.mc_versions?.[0] ?? '1.20.1';
  const loaders = lock.loaders ?? {};
  const key = loaders.forge ? 'forge' : loaders.neoforge ? 'neoforge' : Object.keys(loaders)[0];
  const version = loaders[key];
  const type = key === 'neoforge' ? 'NeoForge' : 'Forge';
  const path = join(workDir, 'forge-auto-install.txt');
  let text = readFileSync(path, 'utf-8');
  text = text
    .replace(/^minecraftVersion=.*$/m, `minecraftVersion=${mc}`)
    .replace(/^loaderType=.*$/m, `loaderType=${type}`)
    .replace(/^loaderVersion=.*$/m, `loaderVersion=${version}`);
  writeFileSync(path, text);
  console.log(`forge-auto-install: ${type} ${version}`);
}

function runAndWait(java, args, cwd, label, successCheck) {
  return new Promise((resolve, reject) => {
    console.log(`> ${label}`);
    const proc = spawn(java, args, { cwd, stdio: 'inherit' });
    proc.on('exit', (code) => {
      if (successCheck?.()) resolve();
      else if (code === 0) resolve();
      else reject(new Error(`${label} exited with code ${code}`));
    });
    proc.on('error', reject);
  });
}

async function waitForExport(java) {
  const exportFile = join(workDir, 'logs', 'tfg-planner-recipe-snapshot', 'recipes.json');
  const runBat = join(workDir, 'run.bat');
  const starterJar = join(workDir, 'minecraft_server.jar');

  if (!existsSync(runBat)) {
    const altRun = join(workDir, 'server-run', 'run.bat');
    if (existsSync(altRun)) {
      console.log('Reusing Forge install from server-run/');
      for (const name of ['run.bat', 'run.sh', 'user_jvm_args.txt']) {
        const from = join(workDir, 'server-run', name);
        if (existsSync(from)) copyFileSync(from, join(workDir, name));
      }
      const libsFrom = join(workDir, 'server-run', 'libraries');
      const libsTo = join(workDir, 'libraries');
      if (existsSync(libsFrom) && !existsSync(libsTo)) {
        spawnSync('xcopy', [libsFrom, libsTo, '/E', '/I', '/Y'], { stdio: 'inherit', shell: true });
      }
    }
  }

  if (!existsSync(runBat)) {
    if (!existsSync(starterJar)) throw new Error('minecraft_server.jar missing');
    await runAndWait(
      java,
      ['-jar', starterJar, '-Xmx6024M', '-Xms1024M', 'nogui'],
      workDir,
      'F-S-S install',
      () => existsSync(runBat),
    );
  }

  if (!existsSync(runBat)) throw new Error('run.bat not created after Forge install');

  console.log(`Starting Forge server (timeout ${serverTimeoutMin}m)...`);
  const proc = spawn('cmd.exe', ['/c', 'run.bat', 'nogui'], {
    cwd: workDir,
    stdio: 'inherit',
  });

  const deadline = Date.now() + serverTimeoutMin * 60 * 1000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 20000));
    if (existsSync(exportFile)) {
      proc.kill();
      return exportFile;
    }
    if (proc.exitCode != null && !existsSync(exportFile)) {
      throw new Error(`Forge server exited (code ${proc.exitCode}) before export`);
    }
  }
  proc.kill();
  throw new Error(`Export timeout: ${exportFile}`);
}

if (!existsSync(join(workDir, 'mods'))) {
  throw new Error(`Missing ${join(workDir, 'mods')} — run generate-tfg-snapshot without --skip-fetch first`);
}

spawnSync('node', [join(repoRoot, 'tools/parser/scripts/prepare-server-overrides.mjs'), workDir], {
  stdio: 'inherit',
});
copyServerStarterFiles();
patchForgeAutoInstall();

const kubeDir = join(workDir, 'kubejs', 'server_scripts');
mkdirSync(kubeDir, { recursive: true });
copyFileSync(exportScript, join(kubeDir, '_tfg_planner_export.js'));
writeFileSync(join(workDir, 'eula.txt'), 'eula=true\n');

const java = resolveJava();
const exportFile = await waitForExport(java);
const recipes = JSON.parse(readFileSync(exportFile, 'utf-8'));
if (recipes.length < minRecipes) {
  throw new Error(`Only ${recipes.length} recipes (need ${minRecipes})`);
}

mkdirSync(outDir, { recursive: true });
const recipesOut = join(outDir, 'recipes.json');
copyFileSync(exportFile, recipesOut);

const key = createHash('sha256')
  .update(`TerraFirmaGreg-Team/Modpack-Modern@${tag}`)
  .digest('hex')
  .slice(0, 16);
const modpackRoot = join(repoRoot, '.cache', 'modpack', key, `Modpack-Modern-${tag}`);
const lockSha = createHash('sha256')
  .update(readFileSync(join(modpackRoot, 'pakku-lock.json')))
  .digest('hex');
const recipesSha = createHash('sha256').update(readFileSync(recipesOut)).digest('hex');
const markers = [
  'gtceu:pyrolyse_oven/log_to_charcoal_byproducts',
  'gtceu:distill_charcoal_byproducts',
  'gtceu:distill_wood_tar',
];
const ids = new Set(recipes.map((r) => r.id));

writeFileSync(
  join(outDir, 'snapshot-manifest.json'),
  JSON.stringify(
    {
      schemaVersion: 1,
      modpackTag: tag,
      pakkuLockSha256: lockSha,
      recipeCount: recipes.length,
      exportedAt: new Date().toISOString(),
      markerRecipeIds: markers.filter((m) => ids.has(m)),
      snapshotSha256: recipesSha,
      source: 'generate-tfg-snapshot',
    },
    null,
    2,
  ),
);

console.log(`Snapshot written: ${outDir} (${recipes.length} recipes)`);
