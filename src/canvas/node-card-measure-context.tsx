import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefCallback,
} from 'react';

const HEIGHT_EPS = 0.5;

type NodeCardMeasureContextValue = {
  heights: Readonly<Record<string, number>>;
  reportHeight: (nodeId: string, height: number) => void;
  clearHeight: (nodeId: string) => void;
};

const NodeCardMeasureContext = createContext<NodeCardMeasureContextValue | null>(null);

export function NodeCardMeasureProvider({ children }: { children: ReactNode }) {
  const [heights, setHeights] = useState<Record<string, number>>({});

  const reportHeight = useCallback((nodeId: string, height: number) => {
    if (!Number.isFinite(height) || height <= 0) return;
    setHeights((prev) => {
      const current = prev[nodeId];
      if (current != null && Math.abs(current - height) <= HEIGHT_EPS) return prev;
      return { ...prev, [nodeId]: height };
    });
  }, []);

  const clearHeight = useCallback((nodeId: string) => {
    setHeights((prev) => {
      if (!(nodeId in prev)) return prev;
      const next = { ...prev };
      delete next[nodeId];
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({ heights, reportHeight, clearHeight }),
    [heights, reportHeight, clearHeight],
  );

  return (
    <NodeCardMeasureContext.Provider value={value}>
      {children}
    </NodeCardMeasureContext.Provider>
  );
}

export function useNodeCardHeights(): Readonly<Record<string, number>> {
  return useContext(NodeCardMeasureContext)?.heights ?? {};
}

/** Attach to `.machine-node` / `.buffer-node` root; reports offsetHeight via ResizeObserver. */
export function useMeasureNodeCard(nodeId: string, measureKey: string): RefCallback<HTMLElement> {
  const ctx = useContext(NodeCardMeasureContext);
  const observerRef = useRef<ResizeObserver | null>(null);
  const elementRef = useRef<HTMLElement | null>(null);

  const report = useCallback(
    (el: HTMLElement) => {
      ctx?.reportHeight(nodeId, el.offsetHeight);
    },
    [ctx, nodeId],
  );

  return useCallback(
    (el: HTMLElement | null) => {
      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }
      elementRef.current = el;
      if (!el || !ctx) return;

      report(el);

      const observer = new ResizeObserver(() => {
        if (elementRef.current) report(elementRef.current);
      });
      observer.observe(el);
      observerRef.current = observer;
    },
    // measureKey triggers re-attach when card structure changes
    // eslint-disable-next-line react-hooks/exhaustive-deps -- measureKey is intentional
    [ctx, nodeId, measureKey, report],
  );
}
