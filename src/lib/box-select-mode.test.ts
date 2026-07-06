import { describe, expect, it } from 'vitest';
import {
  boxSelectModeFromPointer,
  boxSelectWrapClass,
} from '@/lib/box-select-mode';

describe('boxSelectModeFromPointer', () => {
  it('uses window mode when dragging left to right', () => {
    expect(boxSelectModeFromPointer(100, 200)).toBe('window');
  });

  it('uses crossing mode when dragging right to left', () => {
    expect(boxSelectModeFromPointer(200, 100)).toBe('crossing');
  });

  it('uses window mode when X unchanged (>=)', () => {
    expect(boxSelectModeFromPointer(150, 150)).toBe('window');
  });
});

describe('boxSelectWrapClass', () => {
  it('returns modifier classes for active modes', () => {
    expect(boxSelectWrapClass('window')).toBe('editor-canvas-wrap--box-window');
    expect(boxSelectWrapClass('crossing')).toBe(
      'editor-canvas-wrap--box-crossing',
    );
    expect(boxSelectWrapClass(null)).toBe('');
  });
});
