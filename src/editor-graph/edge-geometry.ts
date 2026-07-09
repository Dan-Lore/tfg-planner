import type { XYPosition } from '@xyflow/react';

export function pointOnPolyline(points: XYPosition[], t: number): XYPosition {
  if (points.length === 0) return { x: 0, y: 0 };
  if (points.length === 1) return points[0]!;

  const segments: { length: number; start: XYPosition; end: XYPosition }[] = [];
  let total = 0;

  for (let i = 0; i < points.length - 1; i++) {
    const start = points[i]!;
    const end = points[i + 1]!;
    const length = Math.hypot(end.x - start.x, end.y - start.y);
    if (length === 0) continue;
    segments.push({ length, start, end });
    total += length;
  }

  if (total === 0) return points[0]!;

  let remaining = Math.max(0, Math.min(1, t)) * total;
  for (const segment of segments) {
    if (remaining <= segment.length) {
      const ratio = remaining / segment.length;
      return {
        x: segment.start.x + (segment.end.x - segment.start.x) * ratio,
        y: segment.start.y + (segment.end.y - segment.start.y) * ratio,
      };
    }
    remaining -= segment.length;
  }

  return points[points.length - 1]!;
}
