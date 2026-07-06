export type BoxSelectMode = 'window' | 'crossing';

/** CAD window (LTR) vs crossing (RTL) from pointer X positions. */
export function boxSelectModeFromPointer(
  startClientX: number,
  currentClientX: number,
): BoxSelectMode {
  return currentClientX >= startClientX ? 'window' : 'crossing';
}

export function boxSelectWrapClass(mode: BoxSelectMode | null): string {
  if (mode === 'window') return 'editor-canvas-wrap--box-window';
  if (mode === 'crossing') return 'editor-canvas-wrap--box-crossing';
  return '';
}
