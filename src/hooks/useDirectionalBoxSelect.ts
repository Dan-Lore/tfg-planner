import {
  useCallback,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import { SelectionMode } from '@xyflow/react';
import {
  boxSelectModeFromPointer,
  boxSelectWrapClass,
  type BoxSelectMode,
} from '@/lib/box-select-mode';

export function useDirectionalBoxSelect() {
  const startClientXRef = useRef<number | null>(null);
  const selectingRef = useRef(false);
  const pointerMoveCleanupRef = useRef<(() => void) | null>(null);
  const [boxSelectMode, setBoxSelectMode] = useState<BoxSelectMode | null>(null);

  const updateMode = useCallback((clientX: number) => {
    const start = startClientXRef.current;
    if (start === null) return;
    const mode = boxSelectModeFromPointer(start, clientX);
    setBoxSelectMode((prev) => (prev === mode ? prev : mode));
  }, []);

  const clearSelection = useCallback(() => {
    selectingRef.current = false;
    startClientXRef.current = null;
    setBoxSelectMode(null);
  }, []);

  const onPointerDownCapture = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (!target.classList.contains('react-flow__pane')) return;
      startClientXRef.current = event.clientX;
    },
    [],
  );

  const onSelectionStart = useCallback(
    (event: ReactMouseEvent) => {
      selectingRef.current = true;
      updateMode(event.clientX);

      pointerMoveCleanupRef.current?.();
      const onPointerMove = (moveEvent: PointerEvent) => {
        if (!selectingRef.current) return;
        updateMode(moveEvent.clientX);
      };
      window.addEventListener('pointermove', onPointerMove);
      pointerMoveCleanupRef.current = () => {
        window.removeEventListener('pointermove', onPointerMove);
      };
    },
    [updateMode],
  );

  const onSelectionEnd = useCallback(() => {
    pointerMoveCleanupRef.current?.();
    pointerMoveCleanupRef.current = null;
    clearSelection();
  }, [clearSelection]);

  const selectionMode =
    boxSelectMode === 'window'
      ? SelectionMode.Full
      : SelectionMode.Partial;

  return {
    selectionMode,
    boxSelectMode,
    wrapClassName: boxSelectWrapClass(boxSelectMode),
    onPointerDownCapture,
    onSelectionStart,
    onSelectionEnd,
  };
}
