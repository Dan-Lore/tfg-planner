import { create } from 'zustand';

/**
 * TEMP: routing obstacle debug — remove only when the user explicitly asks.
 */
interface DebugState {
  showObstacleRects: boolean;
  toggleObstacleRects: () => void;
}

export const useDebugStore = create<DebugState>((set) => ({
  showObstacleRects: false,
  toggleObstacleRects: () =>
    set((state) => ({ showObstacleRects: !state.showObstacleRects })),
}));
