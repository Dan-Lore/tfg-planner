import { createContext, useContext, type ReactNode } from 'react';
import type { NodeRect } from '@/canvas/node-bounds';

export interface ObstacleEntry {
  nodeId: string;
  rect: NodeRect;
}

export interface ObstacleRectsContextValue {
  obstacles: ObstacleEntry[];
  /** When true, edges use simple bezier routing (no obstacle pass). */
  skipObstacleRouting: boolean;
}

const defaultValue: ObstacleRectsContextValue = {
  obstacles: [],
  skipObstacleRouting: false,
};

const ObstacleRectsContext = createContext<ObstacleRectsContextValue>(defaultValue);

export function ObstacleRectsProvider({
  value,
  children,
}: {
  value: ObstacleRectsContextValue;
  children: ReactNode;
}) {
  return (
    <ObstacleRectsContext.Provider value={value}>{children}</ObstacleRectsContext.Provider>
  );
}

export function useObstacleRects(): ObstacleRectsContextValue {
  return useContext(ObstacleRectsContext);
}
