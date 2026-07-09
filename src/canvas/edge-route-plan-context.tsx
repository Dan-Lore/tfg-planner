import { createContext, useContext, type ReactNode } from 'react';
import type { EdgeRoutePlanEntry } from '@/editor-graph/edge-route-plan';

const emptyPlan = new Map<string, EdgeRoutePlanEntry>();

const EdgeRoutePlanContext = createContext<Map<string, EdgeRoutePlanEntry>>(
  emptyPlan,
);

export function EdgeRoutePlanProvider({
  plan,
  children,
}: {
  plan: Map<string, EdgeRoutePlanEntry>;
  children: ReactNode;
}) {
  return (
    <EdgeRoutePlanContext.Provider value={plan}>
      {children}
    </EdgeRoutePlanContext.Provider>
  );
}

export function useEdgeRoutePlan(): Map<string, EdgeRoutePlanEntry> {
  return useContext(EdgeRoutePlanContext);
}

export function useEdgeRoutePlanEntry(edgeId: string): EdgeRoutePlanEntry | undefined {
  return useEdgeRoutePlan().get(edgeId);
}
