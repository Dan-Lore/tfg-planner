import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const script = join(process.cwd(), 'tools/parser/scripts/server-jvm-args.mjs');
const GiB = 1024 ** 3;

function runJson(env?: Record<string, string>) {
  const r = spawnSync(process.execPath, [script, '--json'], {
    encoding: 'utf-8',
    env: { ...process.env, ...env },
  });
  expect(r.status).toBe(0);
  return JSON.parse(r.stdout) as {
    systemRamGib: number;
    systemCpus: number;
    jvmCpus: number;
    server: { xmxMib: number; xmsMib: number; xmx: string; flags: string[]; source: string };
    pakku: { xmxMib: number; flags: string[] };
    timeoutMin: number;
  };
}

describe('server-jvm-args', () => {
  it('allocates min(50%, RAM−8GiB) on 64 GiB host', () => {
    const info = runJson({ TFG_SERVER_TOTAL_BYTES: String(64 * GiB) });
    expect(info.server.xmxMib).toBe(32 * 1024);
    expect(info.server.xmx).toBe('-Xmx32768M');
    expect(info.server.xmsMib).toBe(8192);
  });

  it('leaves at least 8 GiB reserve on 16 GiB host', () => {
    const info = runJson({ TFG_SERVER_TOTAL_BYTES: String(16 * GiB) });
    expect(info.server.xmxMib).toBe(8 * 1024);
  });

  it('respects TFG_SERVER_XMX override', () => {
    const info = runJson({ TFG_SERVER_XMX: '12288M', TFG_SERVER_TOTAL_BYTES: String(64 * GiB) });
    expect(info.server.xmxMib).toBe(12288);
    expect(info.server.source).toBe('env');
  });

  it('includes G1GC and CPU flags for server', () => {
    const info = runJson({ TFG_SERVER_TOTAL_BYTES: String(64 * GiB), TFG_SERVER_CPU_COUNT: '16' });
    expect(info.jvmCpus).toBe(12);
    expect(info.server.flags).toContain('-XX:+UseG1GC');
    expect(info.server.flags.some((f) => f.startsWith('-XX:ActiveProcessorCount='))).toBe(true);
  });

  it('allocates separate pakku heap', () => {
    const info = runJson({ TFG_SERVER_TOTAL_BYTES: String(64 * GiB) });
    expect(info.pakku.xmxMib).toBe(16 * 1024);
    expect(info.pakku.flags).toContain('-XX:+UseG1GC');
  });
});
