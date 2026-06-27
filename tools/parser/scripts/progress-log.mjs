/** Shared heartbeat logging for Node export scripts (no TS build step). */

export function logStage(message) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${message}`);
}

export function formatElapsed(ms) {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return min > 0 ? `${min}m ${sec}s` : `${sec}s`;
}

export function createWaitHeartbeat(label, intervalMs = 60_000) {
  const started = Date.now();
  let lastLog = started;
  return {
    maybeLog(extra = '') {
      const now = Date.now();
      if (now - lastLog < intervalMs) return;
      lastLog = now;
      const suffix = extra ? ` — ${extra}` : '';
      logStage(`${label} (${formatElapsed(now - started)} elapsed${suffix})`);
    },
  };
}
