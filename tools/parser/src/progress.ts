/** Periodic console progress for long parser / export steps. */

export interface ProgressReporterOptions {
  /** Log every N items (default 5000). */
  every?: number;
  /** Log at least every N ms even if `every` not hit (default 15s). */
  intervalMs?: number;
}

function timestamp(): string {
  return new Date().toISOString().slice(11, 19);
}

export function logStage(message: string): void {
  console.log(`[${timestamp()}] ${message}`);
}

export function createProgressReporter(label: string, options: ProgressReporterOptions = {}) {
  const every = options.every ?? 5000;
  const intervalMs = options.intervalMs ?? 15_000;
  let lastLog = Date.now();

  return {
    tick(current: number, total?: number): void {
      const now = Date.now();
      const byCount = every > 0 && current % every === 0;
      const byTime = now - lastLog >= intervalMs;
      if (!byCount && !byTime) return;
      lastLog = now;
      const totalPart = total != null ? ` / ${total}` : '';
      console.log(`[${timestamp()}] ${label}: ${current}${totalPart}…`);
    },
    done(count: number, detail?: string): void {
      const suffix = detail ? `, ${detail}` : '';
      console.log(`[${timestamp()}] ${label}: done (${count}${suffix})`);
    },
  };
}

export function mapWithProgress<T, U>(
  items: readonly T[],
  label: string,
  fn: (item: T, index: number) => U,
  options?: ProgressReporterOptions,
): U[] {
  const reporter = createProgressReporter(label, options);
  const out: U[] = new Array(items.length);
  for (let i = 0; i < items.length; i++) {
    out[i] = fn(items[i], i);
    reporter.tick(i + 1, items.length);
  }
  reporter.done(out.length);
  return out;
}
