import { useMemo } from 'react';
import { useEditorStore } from '@/stores/editor-store';

/** Stable editor store actions (no re-render on store updates). */
export function useEditorActions() {
  return useMemo(
    () => ({
      setNodes: (...args: Parameters<ReturnType<typeof useEditorStore.getState>['setNodes']>) =>
        useEditorStore.getState().setNodes(...args),
      setViewport: (...args: Parameters<ReturnType<typeof useEditorStore.getState>['setViewport']>) =>
        useEditorStore.getState().setViewport(...args),
      addNode: (...args: Parameters<ReturnType<typeof useEditorStore.getState>['addNode']>) =>
        useEditorStore.getState().addNode(...args),
      updateNode: (...args: Parameters<ReturnType<typeof useEditorStore.getState>['updateNode']>) =>
        useEditorStore.getState().updateNode(...args),
      removeNodes: (...args: Parameters<ReturnType<typeof useEditorStore.getState>['removeNodes']>) =>
        useEditorStore.getState().removeNodes(...args),
      removeEdges: (...args: Parameters<ReturnType<typeof useEditorStore.getState>['removeEdges']>) =>
        useEditorStore.getState().removeEdges(...args),
      addEdge: (...args: Parameters<ReturnType<typeof useEditorStore.getState>['addEdge']>) =>
        useEditorStore.getState().addEdge(...args),
      attachMachine: (...args: Parameters<ReturnType<typeof useEditorStore.getState>['attachMachine']>) =>
        useEditorStore.getState().attachMachine(...args),
      attachBuffer: (...args: Parameters<ReturnType<typeof useEditorStore.getState>['attachBuffer']>) =>
        useEditorStore.getState().attachBuffer(...args),
      attachCustomMachine: (...args: Parameters<ReturnType<typeof useEditorStore.getState>['attachCustomMachine']>) =>
        useEditorStore.getState().attachCustomMachine(...args),
      addCustomMachine: (...args: Parameters<ReturnType<typeof useEditorStore.getState>['addCustomMachine']>) =>
        useEditorStore.getState().addCustomMachine(...args),
      addCustomPort: (...args: Parameters<ReturnType<typeof useEditorStore.getState>['addCustomPort']>) =>
        useEditorStore.getState().addCustomPort(...args),
      removeCustomPort: (...args: Parameters<ReturnType<typeof useEditorStore.getState>['removeCustomPort']>) =>
        useEditorStore.getState().removeCustomPort(...args),
      ensureCustomPort: (...args: Parameters<ReturnType<typeof useEditorStore.getState>['ensureCustomPort']>) =>
        useEditorStore.getState().ensureCustomPort(...args),
      pushHistory: () => useEditorStore.getState().pushHistory(),
      undo: () => useEditorStore.getState().undo(),
      redo: () => useEditorStore.getState().redo(),
      setTarget: (...args: Parameters<ReturnType<typeof useEditorStore.getState>['setTarget']>) =>
        useEditorStore.getState().setTarget(...args),
      clearTarget: (...args: Parameters<ReturnType<typeof useEditorStore.getState>['clearTarget']>) =>
        useEditorStore.getState().clearTarget(...args),
      setEdgeConstraint: (
        ...args: Parameters<ReturnType<typeof useEditorStore.getState>['setEdgeConstraint']>
      ) => useEditorStore.getState().setEdgeConstraint(...args),
      clearEdgeConstraint: (
        ...args: Parameters<ReturnType<typeof useEditorStore.getState>['clearEdgeConstraint']>
      ) => useEditorStore.getState().clearEdgeConstraint(...args),
      duplicateSelected: () => useEditorStore.getState().duplicateSelected(),
      copySelection: () => useEditorStore.getState().copySelection(),
      pasteClipboard: () => useEditorStore.getState().pasteClipboard(),
      loadScheme: (...args: Parameters<ReturnType<typeof useEditorStore.getState>['loadScheme']>) =>
        useEditorStore.getState().loadScheme(...args),
      clearScheme: () => useEditorStore.getState().clearScheme(),
      setSchemeName: (...args: Parameters<ReturnType<typeof useEditorStore.getState>['setSchemeName']>) =>
        useEditorStore.getState().setSchemeName(...args),
      setSelectedNodeIds: (...args: Parameters<ReturnType<typeof useEditorStore.getState>['setSelectedNodeIds']>) =>
        useEditorStore.getState().setSelectedNodeIds(...args),
      setSelectedEdgeIds: (...args: Parameters<ReturnType<typeof useEditorStore.getState>['setSelectedEdgeIds']>) =>
        useEditorStore.getState().setSelectedEdgeIds(...args),
      updateFlows: () => useEditorStore.getState().updateFlows(),
      refreshFlowDisplay: () => useEditorStore.getState().refreshFlowDisplay(),
      refreshSchemeCheck: () => useEditorStore.getState().refreshSchemeCheck(),
    }),
    [],
  );
}

export type EditorActions = ReturnType<typeof useEditorActions>;
