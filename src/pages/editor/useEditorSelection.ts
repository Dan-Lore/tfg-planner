import { useCallback, type MutableRefObject } from 'react';
import type { OnEdgesDelete, OnNodesDelete, OnSelectionChangeParams } from '@xyflow/react';
import { useEditorStore } from '@/stores/editor-store';
import { idsEqual } from '@/lib/id-array-equal';
import type { EditorActions } from '@/editor/editor-actions';

export function useEditorSelectionHandlers(params: {
  suppressSelectionSyncRemainingRef: MutableRefObject<number>;
  setSelectedNodeIds: EditorActions['setSelectedNodeIds'];
  setSelectedEdgeIds: EditorActions['setSelectedEdgeIds'];
  removeNodes: EditorActions['removeNodes'];
  removeEdges: EditorActions['removeEdges'];
}) {
  const {
    suppressSelectionSyncRemainingRef,
    setSelectedNodeIds,
    setSelectedEdgeIds,
    removeNodes,
    removeEdges,
  } = params;

  const onSelectionChange = useCallback(
    ({ nodes, edges }: OnSelectionChangeParams) => {
      if (suppressSelectionSyncRemainingRef.current > 0) {
        suppressSelectionSyncRemainingRef.current -= 1;
        return;
      }
      const nodeIds = nodes.map((n) => n.id);
      const edgeIds = edges.map((e) => e.id);
      const { selectedNodeIds, selectedEdgeIds } = useEditorStore.getState();
      const nodeChanged = !idsEqual(selectedNodeIds, nodeIds);
      const edgeChanged = !idsEqual(selectedEdgeIds, edgeIds);
      if (nodeChanged) {
        setSelectedNodeIds(nodeIds);
      }
      if (edgeChanged) {
        setSelectedEdgeIds(edgeIds);
      }
    },
    [setSelectedNodeIds, setSelectedEdgeIds, suppressSelectionSyncRemainingRef],
  );

  const onNodesDelete = useCallback<OnNodesDelete>(
    (nodes) => {
      removeNodes(nodes.map((n) => n.id));
    },
    [removeNodes],
  );

  const onEdgesDelete = useCallback<OnEdgesDelete>(
    (edges) => {
      removeEdges(edges.map((e) => e.id));
    },
    [removeEdges],
  );

  return { onSelectionChange, onNodesDelete, onEdgesDelete };
}
