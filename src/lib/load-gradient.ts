import type { CSSProperties } from 'react';

/** Hue 0° red → 30° orange → 55° yellow → 120° green. */
export function loadGradientHue(percent: number): number {
  const t = Math.min(100, Math.max(0, percent)) / 100;
  if (t <= 1 / 3) {
    return (t / (1 / 3)) * 30;
  }
  if (t <= 2 / 3) {
    return 30 + ((t - 1 / 3) / (1 / 3)) * 25;
  }
  return 55 + ((t - 2 / 3) / (1 / 3)) * 65;
}

export function loadGradientStyle(percent: number): CSSProperties {
  const hue = loadGradientHue(percent);
  const color = `hsl(${hue} 78% 42%)`;
  return {
    color,
    background: `color-mix(in srgb, ${color} 16%, transparent)`,
  };
}
