#!/usr/bin/env node
/**
 * Substitute LOADER_* / MINECRAFT_VERSION placeholders in server-overrides
 * (same as Modpack-Modern CI build.yml).
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const workDir = process.argv[2];
if (!workDir) {
  console.error('Usage: prepare-server-overrides.mjs <workDir>');
  process.exit(1);
}

const lock = JSON.parse(readFileSync(join(workDir, 'pakku-lock.json'), 'utf-8'));
const mcVersion = lock.mc_versions?.[0] ?? '1.20.1';
const loaders = lock.loaders ?? {};

let loaderKey = 'forge';
if (loaders.neoforge) loaderKey = 'neoforge';
else if (loaders.forge) loaderKey = 'forge';
else if (Object.keys(loaders).length > 0) loaderKey = Object.keys(loaders)[0];

const loaderVersion = loaders[loaderKey];
if (!loaderVersion) {
  console.error('pakku-lock.json has no loader version');
  process.exit(1);
}

const loaderType = loaderKey === 'neoforge' ? 'NeoForge' : 'Forge';

const replacements = [
  ['MINECRAFT_VERSION', mcVersion],
  ['LOADER_TYPE', loaderType],
  ['LOADER_VERSION', loaderVersion],
];

function patchFile(path) {
  let text = readFileSync(path, 'utf-8');
  for (const [from, to] of replacements) {
    text = text.split(from).join(to);
  }
  writeFileSync(path, text);
}

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full);
    else if (/\.(txt|json|yml|properties|cfg)$/i.test(name)) patchFile(full);
  }
}

const serverOverrides = join(workDir, '.pakku', 'server-overrides');
walk(serverOverrides);

// Ensure forge-auto-install has exact values even if placeholders were already replaced.
const forgeAuto = join(serverOverrides, 'forge-auto-install.txt');
let forgeText = readFileSync(forgeAuto, 'utf-8');
forgeText = forgeText
  .replace(/^minecraftVersion=.*$/m, `minecraftVersion=${mcVersion}`)
  .replace(/^loaderType=.*$/m, `loaderType=${loaderType}`)
  .replace(/^loaderVersion=.*$/m, `loaderVersion=${loaderVersion}`);
writeFileSync(forgeAuto, forgeText);

console.log(`Server overrides: MC ${mcVersion}, ${loaderType} ${loaderVersion}`);
