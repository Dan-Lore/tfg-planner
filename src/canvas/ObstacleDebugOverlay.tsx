/**
 * TEMP: visualizes routing obstacle rects on the canvas.
 * Do not remove until the user explicitly asks.
 */
import { useViewport } from '@xyflow/react';
import { useObstacleRects } from '@/canvas/obstacle-rects-context';
import { useDebugStore } from '@/stores/debug-store';

export function ObstacleDebugOverlay() {
  const showObstacleRects = useDebugStore((s) => s.showObstacleRects);
  const { obstacles } = useObstacleRects();
  const { x, y, zoom } = useViewport();

  if (!showObstacleRects || obstacles.length === 0) {
    return null;
  }

  const strokeWidth = 2 / zoom;
  const dash = 4 / zoom;

  return (
    <svg
      className="obstacle-debug-overlay"
      aria-hidden="true"
    >
      <g transform={`translate(${x}, ${y}) scale(${zoom})`}>
        {obstacles.map(({ nodeId, rect }) => (
          <g key={nodeId}>
            <rect
              x={rect.left}
              y={rect.top}
              width={rect.right - rect.left}
              height={rect.bottom - rect.top}
              className="obstacle-debug-overlay__rect"
              strokeWidth={strokeWidth}
              strokeDasharray={`${dash} ${dash}`}
            />
            <text
              x={rect.left + 4}
              y={rect.top + 14}
              className="obstacle-debug-overlay__label"
              fontSize={11 / zoom}
            >
              {nodeId}
            </text>
          </g>
        ))}
      </g>
    </svg>
  );
}
