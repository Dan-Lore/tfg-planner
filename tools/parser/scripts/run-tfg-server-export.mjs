#!/usr/bin/env node
/**
 * Run TFG dedicated server from pakku serverpack and export recipes.
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
const serverRunDir = join(workDir, 'server-run');
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

function findServerPackZip() {
  const serverPackDir = join(workDir, 'build', 'serverpack');
  if (!existsSync(serverPackDir)) return null;
  const zips = readdirSync(serverPackDir).filter((n) => n.endsWith('.zip'));
  return zips.length > 0 ? join(serverPackDir, zips[0]) : null;
}

function countZipMods(zipPath) {
  if (process.platform === 'win32') {
    const ps = `$z=[IO.Compression.ZipFile]::OpenRead('${zipPath.replace(/'/g, "''")}'); ($z.Entries | Where-Object { $_.FullName -like 'mods/*.jar' }).Count`;
    const r = spawnSync(
      'powershell',
      ['-NoProfile', '-Command', `Add-Type -AssemblyName System.IO.Compression.FileSystem; ${ps}; $z.Dispose()`],
      { encoding: 'utf-8' },
    );
    const n = Number.parseInt((r.stdout ?? '').trim(), 10);
    return Number.isFinite(n) ? n : 0;
  }
  const r = spawnSync('unzip', ['-l', zipPath], { encoding: 'utf-8' });
  return (r.stdout?.match(/mods\/.*\.jar/g) ?? []).length;
}

function countJarMods(dir) {
  const modsDir = join(dir, 'mods');
  if (!existsSync(modsDir)) return 0;
  return readdirSync(modsDir).filter((n) => n.endsWith('.jar')).length;
}

function ensureServerRun() {
  const zip = findServerPackZip();
  const zipMods = zip ? countZipMods(zip) : 0;
  const localMods = countJarMods(serverRunDir);
  const starterJar = join(serverRunDir, 'minecraft_server.jar');

  if (existsSync(starterJar) && localMods >= Math.min(150, zipMods * 0.8)) {
    console.log(`Reusing ${serverRunDir} (${localMods} mods)`);
    return;
  }

  if (localMods > 0 && localMods < zipMods * 0.8) {
    console.log(`server-run incomplete (${localMods}/${zipMods} mods) — re-extracting serverpack`);
    spawnSync('powershell', [
      '-NoProfile',
      '-Command',
      `Remove-Item -Recurse -Force '${serverRunDir.replace(/'/g, "''")}' -ErrorAction SilentlyContinue`,
    ]);
  }

  if (!zip) {
    throw new Error(
      `No serverpack zip in ${join(workDir, 'build', 'serverpack')} — run generate-tfg-snapshot first`,
    );
  }

  console.log(`Extracting serverpack ${zip}…`);
  mkdirSync(serverRunDir, { recursive: true });
  if (process.platform === 'win32') {
    const ps = `Expand-Archive -Path '${zip.replace(/'/g, "''")}' -DestinationPath '${serverRunDir.replace(/'/g, "''")}' -Force`;
    const r = spawnSync('powershell', ['-NoProfile', '-Command', ps], { stdio: 'inherit' });
    if (r.status !== 0) throw new Error('Expand-Archive failed');
  } else {
    const r = spawnSync('unzip', ['-o', zip, '-d', serverRunDir], { stdio: 'inherit' });
    if (r.status !== 0) throw new Error('unzip failed');
  }

  if (!existsSync(starterJar)) {
    throw new Error(`minecraft_server.jar missing after extracting serverpack to ${serverRunDir}`);
  }
}

function injectExportScript() {
  const kubeDir = join(serverRunDir, 'kubejs', 'server_scripts');
  mkdirSync(kubeDir, { recursive: true });
  copyFileSync(exportScript, join(kubeDir, '_tfg_planner_export.js'));
  writeFileSync(join(serverRunDir, 'eula.txt'), 'eula=true\n');
}

async function waitForExport(java) {
  const exportFile = join(serverRunDir, 'logs', 'tfg-planner-recipe-snapshot', 'recipes.json');
  const starterJar = join(serverRunDir, 'minecraft_server.jar');
  if (!existsSync(starterJar)) {
    throw new Error(`minecraft_server.jar missing in ${serverRunDir}`);
  }

  console.log(`Starting dedicated server from serverpack (timeout ${serverTimeoutMin}m)…`);
  const proc = spawn(
    java,
    ['-jar', starterJar, '-Xmx6024M', '-Xms1024M', 'nogui'],
    { cwd: serverRunDir, stdio: 'inherit' },
  );

  const deadline = Date.now() + serverTimeoutMin * 60 * 1000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 20000));
    if (existsSync(exportFile)) {
      if (!proc.killed) proc.kill();
      return exportFile;
    }
    if (proc.exitCode != null && !existsSync(exportFile)) {
      const latest = join(serverRunDir, 'logs', 'latest.log');
      if (existsSync(latest)) {
        console.log('--- latest.log tail ---');
        const lines = readFileSync(latest, 'utf-8').split('\n').slice(-30);
        console.log(lines.join('\n'));
      }
      throw new Error(`Server exited (code ${proc.exitCode}) before export`);
    }
  }
  if (!proc.killed) proc.kill();
  throw new Error(`Export timeout: ${exportFile}`);
}

if (!existsSync(workDir)) {
  throw new Error(`Missing ${workDir} — run generate-tfg-snapshot without --skip-fetch first`);
}

ensureServerRun();
injectExportScript();

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
