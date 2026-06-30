import { useLayoutEffect, useRef } from 'react';
import { useUpdateNodeInternals } from '@xyflow/react';
import { useNodeInternalsGate } from '@/canvas/node-internals-gate';

/** Re-register React Flow handles when node layout structure changes (debounced via rAF). */
export function useNodeInternalsSync(nodeId: string, structuralKey: string): void {
  const updateNodeInternals = useUpdateNodeInternals();
  const gate = useNodeInternalsGate();
  const gateRef = useRef(gate);
  gateRef.current = gate;
  const rafRef = useRef<number | null>(null);

  useLayoutEffect(() => {
    const scheduleUpdate = () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        gateRef.current?.holdEdgesForInternals();
        updateNodeInternals(nodeId);
        gateRef.current?.releaseEdgesForInternals();
      });
    };

    scheduleUpdate();
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
    // structuralKey encodes port topology / card width / recipe — not display-only labels
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional structural gate
  }, [nodeId, structuralKey, updateNodeInternals]);
}
