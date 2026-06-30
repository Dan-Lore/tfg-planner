import { createContext, useContext, type ReactNode } from 'react';
import type { VoltageTier } from '@/calculator/gt-voltage';
import type { TfgpSupplyMode } from '@/schema/tfgp';

export interface EditorNodeActions {
  onRecipeChange: (nodeId: string, recipeId: string) => void;
  onMachineCountChange: (nodeId: string, count: number) => void;
  onOverclockChange: (nodeId: string, overclock: number) => void;
  onVoltageTierChange: (nodeId: string, tier: VoltageTier) => void;
  onCapacityChange: (nodeId: string, capacity: number) => void;
  onSupplyModeChange: (nodeId: string, mode: TfgpSupplyMode) => void;
  onSupplyRateChange: (nodeId: string, rate: number) => void;
  onInitialStockChange: (nodeId: string, stock: number) => void;
  onPortContextMenu: (
    nodeId: string,
    portId: string,
    side: 'in' | 'out',
    clientX: number,
    clientY: number,
  ) => void;
}

const noop = () => {};

const defaultActions: EditorNodeActions = {
  onRecipeChange: noop,
  onMachineCountChange: noop,
  onOverclockChange: noop,
  onVoltageTierChange: noop,
  onCapacityChange: noop,
  onSupplyModeChange: noop,
  onSupplyRateChange: noop,
  onInitialStockChange: noop,
  onPortContextMenu: noop,
};

const EditorNodeActionsContext = createContext<EditorNodeActions>(defaultActions);

export function EditorNodeActionsProvider({
  value,
  children,
}: {
  value: EditorNodeActions;
  children: ReactNode;
}) {
  return (
    <EditorNodeActionsContext.Provider value={value}>
      {children}
    </EditorNodeActionsContext.Provider>
  );
}

export function useEditorNodeActions(): EditorNodeActions {
  return useContext(EditorNodeActionsContext);
}
