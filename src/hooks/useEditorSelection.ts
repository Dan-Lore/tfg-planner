import { useCallback, type RefObject } from 'react';
import type { EditorCanvasHandle } from '@/canvas/EditorCanvas';
import type { EditorActions } from '@/editor/editor-actions';

export type FocusSelectionParams = {
  nodeIds: readonly string[];
  edgeIds: readonly string[];
};

/** Programmatic canvas selection: store (inspector/minimap) + RF edge highlight. */
export function useEditorSelection(params: {
  canvasRef: RefObject<EditorCanvasHandle | null>;
  setSelectedNodeIds: EditorActions['setSelectedNodeIds'];
  setSelectedEdgeIds: EditorActions['setSelectedEdgeIds'];
}) {
  const { canvasRef, setSelectedNodeIds, setSelectedEdgeIds } = params;

  const focusSelection = useCallback(
    ({ nodeIds, edgeIds }: FocusSelectionParams) => {
      setSelectedNodeIds([...nodeIds]);
      setSelectedEdgeIds([...edgeIds]);
      canvasRef.current?.focusSelection({ nodeIds, edgeIds });
    },
    [canvasRef, setSelectedNodeIds, setSelectedEdgeIds],
  );

  return { focusSelection };
}
