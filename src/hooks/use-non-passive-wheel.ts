import { useEffect, useRef, type RefObject } from 'react';

export type WheelHandler = (event: WheelEvent) => void;

/** Register a cancellable wheel listener ({ passive: false }). */
export function bindNonPassiveWheel(
  element: HTMLElement,
  onWheel: WheelHandler,
): () => void {
  const listener = (event: WheelEvent) => onWheel(event);
  element.addEventListener('wheel', listener, { passive: false });
  return () => element.removeEventListener('wheel', listener);
}

/**
 * React `onWheel` is passive — preventDefault() is ignored and scroll/zoom still runs.
 * Use this hook for wheel-to-adjust controls inside scrollable panels or React Flow.
 */
export function useNonPassiveWheel<T extends HTMLElement>(
  onWheel: WheelHandler,
): RefObject<T | null> {
  const ref = useRef<T>(null);
  const onWheelRef = useRef(onWheel);
  onWheelRef.current = onWheel;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    return bindNonPassiveWheel(el, (event) => onWheelRef.current(event));
  }, []);

  return ref;
}
