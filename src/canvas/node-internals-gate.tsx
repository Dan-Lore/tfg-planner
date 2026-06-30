import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

const NodeInternalsGateActionsContext = createContext<{
  holdEdgesForInternals: () => void;
  releaseEdgesForInternals: () => void;
} | null>(null);

const NodeInternalsGateHoldContext = createContext(false);

export function NodeInternalsGateProvider({ children }: { children: ReactNode }) {
  const pendingRef = useRef(0);
  const [internalsHold, setInternalsHold] = useState(false);

  const holdEdgesForInternals = useCallback(() => {
    pendingRef.current += 1;
    if (pendingRef.current === 1) setInternalsHold(true);
  }, []);

  const releaseEdgesForInternals = useCallback(() => {
    requestAnimationFrame(() => {
      pendingRef.current = Math.max(0, pendingRef.current - 1);
      if (pendingRef.current > 0) return;
      requestAnimationFrame(() => {
        if (pendingRef.current === 0) setInternalsHold(false);
      });
    });
  }, []);

  const actions = useMemo(
    () => ({ holdEdgesForInternals, releaseEdgesForInternals }),
    [holdEdgesForInternals, releaseEdgesForInternals],
  );

  return (
    <NodeInternalsGateActionsContext.Provider value={actions}>
      <NodeInternalsGateHoldContext.Provider value={internalsHold}>
        {children}
      </NodeInternalsGateHoldContext.Provider>
    </NodeInternalsGateActionsContext.Provider>
  );
}

export function useNodeInternalsGate(): {
  holdEdgesForInternals: () => void;
  releaseEdgesForInternals: () => void;
} | null {
  return useContext(NodeInternalsGateActionsContext);
}

/** For EditorCanvas — hide edges while handles refresh. */
export function useInternalsHold(): boolean {
  return useContext(NodeInternalsGateHoldContext);
}
