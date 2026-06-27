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
  rmSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describeExportResources, getServerJvmFlags, computeServerTimeoutMin } from './server-jvm-args.mjs';
import { createWaitHeartbeat, logStage } from './progress-log.mjs';

const tag = process.argv[2] ?? '0.12.8';
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const workDir = join(repoRoot, '.cache', 'tfg-snapshot', tag);
const serverRunDir = join(workDir, 'server-run');
const outDir = join(repoRoot, 'tools', 'parser', 'snapshots', tag);
const exportScript = join(repoRoot, 'tools', 'parser', 'snapshot', 'kubejs-export-recipes.js');
const serverTimeoutMin = computeServerTimeoutMin();
const minRecipes = 40_000;

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

function removeDirRecursive(path) {
  if (existsSync(path)) rmSync(path, { recursive: true, force: true });
}

/** F-S-S downloads Forge into libraries/ on first boot; partial installs break startup. */
function isForgeInstallComplete(dir) {
  const serverLib = join(dir, 'libraries', 'net', 'minecraft', 'server');
  if (!existsSync(serverLib)) return false;
  for (const version of readdirSync(serverLib)) {
    if (existsSync(join(serverLib, version, `server-${version}-srg.jar`))) return true;
  }
  return false;
}

function ensureServerRun() {
  const zip = findServerPackZip();
  const zipMods = zip ? countZipMods(zip) : 0;
  const localMods = countJarMods(serverRunDir);
  const starterJar = join(serverRunDir, 'minecraft_server.jar');
  const kubeDataDir = join(serverRunDir, 'kubejs', 'data', 'tfg');

  if (
    existsSync(starterJar) &&
    localMods >= Math.min(150, zipMods * 0.8) &&
    existsSync(kubeDataDir)
  ) {
    const forgeNote = isForgeInstallComplete(serverRunDir) ? '' : ', Forge reinstall pending';
    console.log(`Reusing ${serverRunDir} (${localMods} mods${forgeNote})`);
    return;
  }

  if (existsSync(starterJar) && !existsSync(kubeDataDir)) {
    console.log('server-run missing kubejs/data (datapack) — re-extracting serverpack');
    removeDirRecursive(serverRunDir);
  } else if (localMods > 0 && localMods < zipMods * 0.8) {
    console.log(`server-run incomplete (${localMods}/${zipMods} mods) — re-extracting serverpack`);
    removeDirRecursive(serverRunDir);
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

function configureServerForExport() {
  const propsPath = join(serverRunDir, 'server.properties');
  let text = existsSync(propsPath) ? readFileSync(propsPath, 'utf-8') : '';
  const patch = (key, value) => {
    const re = new RegExp(`^${key}=.*$`, 'm');
    if (re.test(text)) text = text.replace(re, `${key}=${value}`);
    else text += `\n${key}=${value}\n`;
  };
  // Avoid clash with a real/local MC server on 25565; export does not need online mode.
  patch('server-port', '25566');
  patch('query.port', '25566');
  patch('online-mode', 'false');
  writeFileSync(propsPath, text);
}

function injectExportScript() {
  const kubeDir = join(serverRunDir, 'kubejs', 'server_scripts');
  mkdirSync(kubeDir, { recursive: true });
  // Legacy serverpack may still ship the old ES5-incompatible script.
  removeDirRecursive(join(kubeDir, '_tfg_planner_export.js'));
  copyFileSync(exportScript, join(kubeDir, 'zzz_tfg_planner_export.js'));
  writeFileSync(join(serverRunDir, 'eula.txt'), 'eula=true\n');
  configureServerForExport();

  const libsDir = join(serverRunDir, 'libraries');
  if (existsSync(libsDir) && !isForgeInstallComplete(serverRunDir)) {
    console.log('Incomplete Forge install — clearing libraries for F-S-S reinstall');
    removeDirRecursive(libsDir);
  }

  // Clear stale export artifacts only (never delete kubejs/data — datapack JSON).
  const exportDirs = [
    join(serverRunDir, 'kubejs', 'config', 'tfg-planner-recipe-snapshot'),
    join(serverRunDir, 'logs', 'tfg-planner-recipe-snapshot'),
  ];
  for (const exportDir of exportDirs) {
    removeDirRecursive(exportDir);
    mkdirSync(exportDir, { recursive: true });
  }
  // Fresh world so export flag in persistentData does not skip re-runs.
  removeDirRecursive(join(serverRunDir, 'world'));
}

async function waitForExport(java) {
  const manifestPath = join(
    serverRunDir,
    'kubejs',
    'config',
    'tfg-planner-recipe-snapshot',
    'manifest.json',
  );
  const exportCandidates = [
    manifestPath,
    join(serverRunDir, 'logs', 'tfg-planner-recipe-snapshot', 'manifest.json'),
    join(serverRunDir, 'config', 'tfg-planner-recipe-snapshot', 'manifest.json'),
    join(serverRunDir, 'kubejs', 'tfg-planner-recipe-snapshot', 'recipes.json'),
    join(serverRunDir, 'logs', 'tfg-planner-recipe-snapshot', 'recipes.json'),
  ];
  const starterJar = join(serverRunDir, 'minecraft_server.jar');
  if (!existsSync(starterJar)) {
    throw new Error(`minecraft_server.jar missing in ${serverRunDir}`);
  }

  const resources = describeExportResources();
  console.log(
    `Starting dedicated server (timeout ${serverTimeoutMin}m, ${resources.jvmCpus} JVM CPUs, ${resources.server.xmx} ${resources.server.xms}, system ${resources.systemRamGib} GiB)…`,
  );
  const proc = spawn(
    java,
    [...getServerJvmFlags(), '-jar', starterJar, 'nogui'],
    { cwd: serverRunDir, stdio: 'inherit' },
  );

  const deadline = Date.now() + serverTimeoutMin * 60 * 1000;
  const heartbeat = createWaitHeartbeat('Waiting for server export', 60_000);
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 5000));
    const serverState = proc.exitCode == null ? 'running' : `exited (${proc.exitCode})`;
    heartbeat.maybeLog(`server ${serverState}`);
    for (const exportFile of exportCandidates) {
      if (existsSync(exportFile)) {
        await new Promise((r) => setTimeout(r, 3000));
        if (!proc.killed && proc.exitCode == null) proc.kill();
        return exportFile;
      }
    }
    if (proc.exitCode != null) {
      for (const exportFile of exportCandidates) {
        if (existsSync(exportFile)) return exportFile;
      }
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
  throw new Error(`Export timeout: ${manifestPath}`);
}

function manifestChunkPaths(manifestRaw) {
  if (Array.isArray(manifestRaw)) return manifestRaw;
  if (manifestRaw && Array.isArray(manifestRaw.chunks)) return manifestRaw.chunks;
  throw new Error('Invalid export manifest format');
}

function chunkRecipes(chunkRaw) {
  if (Array.isArray(chunkRaw)) return chunkRaw;
  if (chunkRaw && Array.isArray(chunkRaw.recipes)) return chunkRaw.recipes;
  throw new Error('Invalid export chunk format');
}

function loadExportedRecipes(exportPath) {
  const primaryManifest = join(
    serverRunDir,
    'kubejs',
    'config',
    'tfg-planner-recipe-snapshot',
    'manifest.json',
  );
  const legacyManifest = join(serverRunDir, 'logs', 'tfg-planner-recipe-snapshot', 'manifest.json');
  const manifestFile = existsSync(primaryManifest) ? primaryManifest : legacyManifest;
  if (existsSync(manifestFile)) {
    const chunkRelPaths = manifestChunkPaths(JSON.parse(readFileSync(manifestFile, 'utf-8')));
    const recipes = [];
    for (const rel of chunkRelPaths) {
      const chunkPath = join(serverRunDir, ...String(rel).split('/'));
      recipes.push(...chunkRecipes(JSON.parse(readFileSync(chunkPath, 'utf-8'))));
    }
    return recipes;
  }
  return JSON.parse(readFileSync(exportPath, 'utf-8'));
}

if (!existsSync(workDir)) {
  throw new Error(`Missing ${workDir} — run generate-tfg-snapshot without --skip-fetch first`);
}

ensureServerRun();
injectExportScript();

const java = resolveJava();
const exportFile = await waitForExport(java);

logStage('Merging exported recipe chunks…');
mkdirSync(outDir, { recursive: true });
const recipesOut = join(outDir, 'recipes.json');
const recipes = loadExportedRecipes(exportFile);
writeFileSync(recipesOut, JSON.stringify(recipes));

const exportManifestPath = join(
  serverRunDir,
  'kubejs',
  'config',
  'tfg-planner-recipe-snapshot',
  'manifest.json',
);
let exportManifest = null;
if (existsSync(exportManifestPath)) {
  exportManifest = JSON.parse(readFileSync(exportManifestPath, 'utf-8'));
}

if (recipes.length < minRecipes) {
  throw new Error(`Only ${recipes.length} recipes (need ${minRecipes})`);
}

const raw = readFileSync(recipesOut, 'utf-8');

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
  'tfg:tfc_wood_sapling_pine/1',
  'tfg:raw_aromatic_mix_charcoal_hydrogen',
  'tfg:aromatic_feedstock@lcr',
  'tfg:reformed_aromatic_feedstock@lcr',
  'tfg:reformate_gas_cracker',
  'gtceu:pyrolyse_oven/log_to_charcoal_byproducts',
  'gtceu:distillation_tower/distill_wood_tar',
];
const markerAliases = {
  'gtceu:pyrolyse_oven/log_to_charcoal_byproducts': ['tfg:pyrolyse_oven/log_to_charcoal_byproducts'],
  'gtceu:distillation_tower/distill_wood_tar': [
    'gtceu:distill_wood_tar',
    'tfg:distillation_tower/distill_wood_tar',
  ],
  'tfg:tfc_wood_sapling_pine/1': ['tfg:greenhouse/8x_tfc_wood_sapling_pine/1'],
  'tfg:raw_aromatic_mix_charcoal_hydrogen': [
    'tfg:coal_liquefaction_tower/raw_aromatic_mix_charcoal_hydrogen',
  ],
  'tfg:aromatic_feedstock@lcr': ['tfg:large_chemical_reactor/aromatic_feedstock'],
  'tfg:reformed_aromatic_feedstock@lcr': ['tfg:large_chemical_reactor/reformed_aromatic_feedstock'],
  'tfg:reformate_gas_cracker': ['tfg:cracker/reformate_gas_cracker'],
};
function markerPresent(ids, marker) {
  if (ids.has(marker)) return true;
  for (const alt of markerAliases[marker] ?? []) {
    if (ids.has(alt)) return true;
  }
  return false;
}
const ids = new Set(recipes.map((r) => r.id));
const recipeCount = recipes.length;
const tfgCount = recipes.filter((r) => String(r.id).startsWith('tfg:')).length;
const typeCounts = exportManifest?.typeCounts ?? null;
const serializeStats = exportManifest?.serializeStats ?? null;

if (tfgCount < 3000) {
  throw new Error(`Only ${tfgCount} tfg: recipes in export (need >= 3000)`);
}
for (const marker of markers) {
  if (!markerPresent(ids, marker)) {
    throw new Error(`Missing marker recipe in export: ${marker}`);
  }
}

writeFileSync(
  join(outDir, 'snapshot-manifest.json'),
  JSON.stringify(
    {
      schemaVersion: 2,
      modpackTag: tag,
      pakkuLockSha256: lockSha,
      recipeCount,
      exportedAt: new Date().toISOString(),
      markerRecipeIds: markers.filter((m) => markerPresent(ids, m)),
      snapshotSha256: recipesSha,
      typeCounts,
      serializeStats,
      source: 'generate-tfg-snapshot',
    },
    null,
    2,
  ),
);

console.log(`Snapshot written: ${outDir} (${recipeCount} recipes)`);
