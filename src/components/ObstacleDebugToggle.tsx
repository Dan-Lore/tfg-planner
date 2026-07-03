/**
 * TEMP: temporary debug control for routing obstacle rects.
 * Do not remove until the user explicitly asks.
 */
import { useTranslation } from 'react-i18next';
import { useDebugStore } from '@/stores/debug-store';

export function ObstacleDebugToggle() {
  const { t } = useTranslation();
  const showObstacleRects = useDebugStore((s) => s.showObstacleRects);
  const toggleObstacleRects = useDebugStore((s) => s.toggleObstacleRects);

  return (
    <button
      type="button"
      className={[
        'debug-toggle',
        showObstacleRects ? 'debug-toggle--active' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      onClick={toggleObstacleRects}
      aria-pressed={showObstacleRects}
      aria-label={t('debug.obstacleRects.ariaLabel')}
      title={t('debug.obstacleRects.title')}
    >
      {t('debug.obstacleRects.label')}
    </button>
  );
}
