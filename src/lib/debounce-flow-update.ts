const FLOW_DEBOUNCE_MS = 100;

export type DebouncedFn = (() => void) & { flush: () => void; cancel: () => void };

export function debounceFlowUpdate(fn: () => void, ms = FLOW_DEBOUNCE_MS): DebouncedFn {
  let timer: ReturnType<typeof setTimeout> | null = null;

  const debounced = (() => {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn();
    }, ms);
  }) as DebouncedFn;

  debounced.flush = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    fn();
  };

  debounced.cancel = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  return debounced;
}
