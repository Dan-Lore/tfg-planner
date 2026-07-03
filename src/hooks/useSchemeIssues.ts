import { useCallback, type RefObject } from 'react';
import type { EditorCanvasHandle } from '@/canvas/EditorCanvas';
import type { NodeDynamicDisplay } from '@/canvas/node-display-context';
import type { ActivePack } from '@/data/pack-runtime';
import { resolveIssueFocusPoint } from '@/lib/viewport-focus';
import type { SchemeIssue } from '@/scheme-check/check-scheme';
import type { TfgpEdge, TfgpNode } from '@/schema/tfgp';
import type { EditorActions } from '@/editor/editor-actions';

export function useSchemeIssues(params: {
  schemeNodes: TfgpNode[];
  schemeEdges: TfgpEdge[];
  pack: ActivePack | null;
  layoutWidthByNodeId: Record<string, number>;
  nodeDisplayById: Record<string, NodeDynamicDisplay>;
  canvasRef: RefObject<EditorCanvasHandle | null>;
  setSelectedNodeIds: EditorActions['setSelectedNodeIds'];
  setSelectedEdgeIds: EditorActions['setSelectedEdgeIds'];
}) {
  const {
    schemeNodes,
    schemeEdges,
    pack,
    layoutWidthByNodeId,
    nodeDisplayById,
    canvasRef,
    setSelectedNodeIds,
    setSelectedEdgeIds,
  } = params;

  const handleFocusIssue = useCallback(
    (issue: SchemeIssue) => {
      if (issue.edgeId) {
        const edge = schemeEdges.find((e) => e.id === issue.edgeId);
        setSelectedEdgeIds([issue.edgeId]);
        setSelectedNodeIds(
          edge ? [edge.source, edge.target] : issue.nodeId ? [issue.nodeId] : [],
        );
        return;
      }
      if (issue.nodeId) {
        setSelectedNodeIds([issue.nodeId]);
        setSelectedEdgeIds([]);
        return;
      }
      const nodeIdsRaw = issue.context?.nodeIds;
      if (nodeIdsRaw) {
        const ids = nodeIdsRaw
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        if (ids.length > 0) {
          setSelectedNodeIds(ids);
          setSelectedEdgeIds([]);
        }
      }
    },
    [schemeEdges, setSelectedEdgeIds, setSelectedNodeIds],
  );

  const handlePanToIssue = useCallback(
    (issue: SchemeIssue) => {
      if (!pack) return;
      const point = resolveIssueFocusPoint(issue, {
        nodes: schemeNodes,
        edges: schemeEdges,
        pack,
        layoutWidthByNodeId,
        displayById: nodeDisplayById,
      });
      if (point) {
        canvasRef.current?.panToPoint(point.x, point.y);
      }
    },
    [pack, schemeNodes, schemeEdges, layoutWidthByNodeId, nodeDisplayById, canvasRef],
  );

  return { handleFocusIssue, handlePanToIssue };
}
