#!/usr/bin/env node
/**
 * Dynamic JVM resources for TFG snapshot export (server + pakku).
 *
 * RAM policy (server): Xmx = max(4 GiB, min(50% RAM, RAM − reserve)).
 * Reserve ≥ 8 GiB for OS (TFG_SERVER_RESERVE_GIB). Override: TFG_SERVER_XMX.
 *
 * CPU policy: ActiveProcessorCount = min(75% cores, cores − reserve), min 2.
 * Override: TFG_SERVER_CPU_COUNT.
 */
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const GiB = 1024 ** 3;
const MiB = 1024 ** 2;

const DEFAULT_RESERVE_GIB = 8;
const DEFAULT_MAX_FRACTION = 0.5;
const DEFAULT_CPU_MAX_FRACTION = 0.75;
const DEFAULT_CPU_RESERVE = 2;
const DEFAULT_SERVER_TIMEOUT_MIN = 120;
const MIN_XMX_MIB = 4096;
const MIN_XMS_MIB = 1024;
const MIN_PAKKU_XMX_MIB = 2048;

function readTotalBytes() {
  const override = process.env.TFG_SERVER_TOTAL_BYTES;
  if (override != null && override !== '') {
    const n = Number.parseInt(override, 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return os.totalmem();
}

function readCpuCount() {
  const override = process.env.TFG_SERVER_CPU_COUNT;
  if (override != null && override !== '') {
    const n = Number.parseInt(override, 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return os.cpus().length;
}

function envNumber(name, fallback) {
  const raw = process.env[name];
  if (raw == null || raw === '') return fallback;
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) ? n : fallback;
}

function parseHeapMib(value) {
  const m = String(value).trim().match(/^(\d+(?:\.\d+)?)\s*([mMgG])?$/);
  if (!m) return null;
  const amount = Number.parseFloat(m[1]);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const unit = (m[2] ?? 'm').toLowerCase();
  return unit === 'g' ? Math.floor(amount * 1024) : Math.floor(amount);
}

function formatHeapFlag(prefix, mib) {
  return `${prefix}${mib}M`;
}

/** Cores for JVM parallel GC / compilation (leave headroom for OS). */
export function computeJvmCpuCount(cpuCount = readCpuCount()) {
  const maxFraction = envNumber('TFG_SERVER_CPU_MAX_FRACTION', DEFAULT_CPU_MAX_FRACTION);
  const reserve = Math.floor(envNumber('TFG_SERVER_CPU_RESERVE', DEFAULT_CPU_RESERVE));
  const byFraction = Math.floor(cpuCount * maxFraction);
  const byReserve = Math.max(1, cpuCount - reserve);
  return Math.max(2, Math.min(byFraction, byReserve));
}

function computeXmsMib(xmxMib) {
  const overrideXms = process.env.TFG_SERVER_XMS
    ? parseHeapMib(process.env.TFG_SERVER_XMS)
    : null;
  if (overrideXms != null) return overrideXms;

  const maxXmsMib =
    xmxMib >= 24 * 1024 ? 8192 : xmxMib >= 12 * 1024 ? 4096 : xmxMib >= 8192 ? 3072 : 2048;
  const quarter = Math.floor(xmxMib * 0.25);
  return Math.max(MIN_XMS_MIB, Math.min(maxXmsMib, quarter));
}

/** @param {number} [totalBytes] */
export function computeServerJvmHeapMib(totalBytes = readTotalBytes()) {
  const overrideXmx = process.env.TFG_SERVER_XMX
    ? parseHeapMib(process.env.TFG_SERVER_XMX)
    : null;
  if (overrideXmx != null) {
    return { xmxMib: overrideXmx, xmsMib: computeXmsMib(overrideXmx), source: 'env' };
  }

  const reserveGib = envNumber('TFG_SERVER_RESERVE_GIB', DEFAULT_RESERVE_GIB);
  const maxFraction = envNumber('TFG_SERVER_MAX_FRACTION', DEFAULT_MAX_FRACTION);
  const reserveBytes = reserveGib * GiB;

  const byFraction = Math.floor(totalBytes * maxFraction);
  const byReserve = Math.floor(totalBytes - reserveBytes);
  let capBytes = Math.min(byFraction, byReserve);

  if (capBytes <= 0) {
    capBytes = Math.max(MiB, Math.floor(totalBytes * 0.4));
  }

  const xmxMib = Math.max(MIN_XMX_MIB, Math.floor(capBytes / MiB));
  return { xmxMib, xmsMib: computeXmsMib(xmxMib), source: 'auto' };
}

/** pakku fetch/export runs alone — may use a separate slice before server boot. */
export function computePakkuJvmHeapMib(totalBytes = readTotalBytes()) {
  const override = process.env.TFG_PAKKU_XMX ? parseHeapMib(process.env.TFG_PAKKU_XMX) : null;
  if (override != null) return override;

  const reserveGib = envNumber('TFG_SERVER_RESERVE_GIB', DEFAULT_RESERVE_GIB);
  const maxFraction = envNumber('TFG_PAKKU_MAX_FRACTION', 0.35);
  const maxCapMib = envNumber('TFG_PAKKU_MAX_XMX_MIB', 16 * 1024);
  const reserveBytes = reserveGib * GiB;

  const capBytes = Math.min(
    Math.floor(totalBytes * maxFraction),
    Math.floor(totalBytes - reserveBytes),
  );
  const xmxMib = Math.max(MIN_PAKKU_XMX_MIB, Math.min(maxCapMib, Math.floor(capBytes / MiB)));
  return xmxMib;
}

function g1GcFlags(xmxMib) {
  const flags = [
    '-XX:+UseG1GC',
    '-XX:+ParallelRefProcEnabled',
    '-XX:MaxGCPauseMillis=200',
    '-XX:+UnlockExperimentalVMOptions',
    '-XX:+DisableExplicitGC',
    '-XX:+AlwaysPreTouch',
    '-XX:G1MixedGCCountTarget=4',
    '-XX:InitiatingHeapOccupancyPercent=15',
  ];

  if (xmxMib >= 16 * 1024) {
    flags.push('-XX:G1HeapRegionSize=32M', '-XX:G1NewSizePercent=30', '-XX:G1MaxNewSizePercent=40');
  } else if (xmxMib >= 8192) {
    flags.push('-XX:G1HeapRegionSize=16M');
  } else {
    flags.push('-XX:G1HeapRegionSize=8M');
  }

  return flags;
}

function cpuFlags(cpuCount = readCpuCount()) {
  return [`-XX:ActiveProcessorCount=${computeJvmCpuCount(cpuCount)}`];
}

/** Forge dedicated server — longer KubeJS/mod load on first boot. */
export function computeServerTimeoutMin() {
  const override = process.env.TFG_SERVER_TIMEOUT_MIN;
  if (override != null && override !== '') {
    const n = Number.parseInt(override, 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return DEFAULT_SERVER_TIMEOUT_MIN;
}

/** @returns {string[]} full JVM args before -jar */
export function getServerJvmFlags(totalBytes = readTotalBytes(), cpuCount = readCpuCount()) {
  const { xmxMib, xmsMib } = computeServerJvmHeapMib(totalBytes);
  return [
    formatHeapFlag('-Xmx', xmxMib),
    formatHeapFlag('-Xms', xmsMib),
    ...cpuFlags(cpuCount),
    ...g1GcFlags(xmxMib),
  ];
}

/** @returns {string[]} JVM args for pakku.jar */
export function getPakkuJvmFlags(totalBytes = readTotalBytes(), cpuCount = readCpuCount()) {
  const xmxMib = computePakkuJvmHeapMib(totalBytes);
  const xmsMib = Math.max(1024, Math.min(2048, Math.floor(xmxMib * 0.25)));
  return [
    formatHeapFlag('-Xmx', xmxMib),
    formatHeapFlag('-Xms', xmsMib),
    ...cpuFlags(cpuCount),
    ...g1GcFlags(xmxMib),
  ];
}

/** @deprecated use getServerJvmFlags */
export function getServerJvmHeapFlags(totalBytes = readTotalBytes()) {
  const { xmxMib, xmsMib } = computeServerJvmHeapMib(totalBytes);
  return [formatHeapFlag('-Xmx', xmxMib), formatHeapFlag('-Xms', xmsMib)];
}

export function describeServerJvmHeap(totalBytes = readTotalBytes()) {
  const totalGib = (totalBytes / GiB).toFixed(1);
  const { xmxMib, xmsMib, source } = computeServerJvmHeapMib(totalBytes);
  return {
    totalGib: Number.parseFloat(totalGib),
    xmxMib,
    xmsMib,
    xmx: formatHeapFlag('-Xmx', xmxMib),
    xms: formatHeapFlag('-Xms', xmsMib),
    source,
  };
}

export function describeExportResources(
  totalBytes = readTotalBytes(),
  cpuCount = readCpuCount(),
) {
  const heap = computeServerJvmHeapMib(totalBytes);
  const pakkuXmxMib = computePakkuJvmHeapMib(totalBytes);
  const jvmCpus = computeJvmCpuCount(cpuCount);
  return {
    systemRamGib: Number.parseFloat((totalBytes / GiB).toFixed(1)),
    systemCpus: cpuCount,
    jvmCpus,
    server: {
      ...heap,
      xmx: formatHeapFlag('-Xmx', heap.xmxMib),
      xms: formatHeapFlag('-Xms', heap.xmsMib),
      flags: getServerJvmFlags(totalBytes, cpuCount),
    },
    pakku: {
      xmxMib: pakkuXmxMib,
      xmx: formatHeapFlag('-Xmx', pakkuXmxMib),
      flags: getPakkuJvmFlags(totalBytes, cpuCount),
    },
    timeoutMin: computeServerTimeoutMin(),
  };
}

function main() {
  const args = process.argv.slice(2);
  const info = describeExportResources();

  if (args.includes('--json')) {
    console.log(JSON.stringify(info));
    return;
  }
  if (args.includes('--print')) {
    console.log(`${info.server.xmx} ${info.server.xms}`);
    return;
  }
  if (args.includes('--server-flags')) {
    console.log(info.server.flags.join(' '));
    return;
  }
  if (args.includes('--pakku-flags')) {
    console.log(info.pakku.flags.join(' '));
    return;
  }
  if (args.includes('--shell')) {
    console.log(`TFG_SERVER_XMX="${info.server.xmx}" TFG_SERVER_XMS="${info.server.xms}"`);
    return;
  }

  console.log(
    [
      `System: ${info.systemRamGib} GiB RAM, ${info.systemCpus} CPUs (JVM ${info.jvmCpus})`,
      `Server: ${info.server.xmx} ${info.server.xms} + G1GC (${info.server.source})`,
      `Pakku:  ${info.pakku.xmx} + G1GC`,
      `Timeout: ${info.timeoutMin} min`,
    ].join('\n'),
  );
}

function isCliEntry() {
  const entry = process.argv[1];
  if (!entry) return false;
  return path.resolve(entry) === path.resolve(fileURLToPath(import.meta.url));
}

if (isCliEntry()) {
  main();
}
