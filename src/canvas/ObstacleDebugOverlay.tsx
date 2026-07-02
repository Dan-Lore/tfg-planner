// DEBUG: временная подсветка зон obstacle routing для оценки padding — удалить после настройки.
import { ViewportPortal } from '@xyflow/react';
import { useObstacleRects } from '@/canvas/obstacle-rects-context';

/** DEBUG: выключить overlay без удаления файла. */
export const DEBUG_SHOW_OBSTACLE_RECTS = true;

export function ObstacleDebugOverlay() {
  const { obstacles, skipObstacleRouting } = useObstacleRects();
  if (!DEBUG_SHOW_OBSTACLE_RECTS || skipObstacleRouting || obstacles.length === 0) {
    return null;
  }

  return (
    <ViewportPortal>
      <svg
        className="obstacle-debug-overlay"
        aria-hidden
        // DEBUG: координаты rect уже в flow-space (как у edge routing).
      >
        {obstacles.map(({ nodeId, rect }) => (
          <g key={nodeId}>
            <rect
              x={rect.left}
              y={rect.top}
              width={rect.right - rect.left}
              height={rect.bottom - rect.top}
              className="obstacle-debug-overlay__rect"
            />
            <text
              x={rect.left + 4}
              y={rect.top + 12}
              className="obstacle-debug-overlay__label"
            >
              {nodeId}
            </text>
          </g>
        ))}
      </svg>
    </ViewportPortal>
  );
}
