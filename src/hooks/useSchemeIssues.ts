import { useCallback, type RefObject } from 'react';
import type { EditorCanvasHandle } from '@/canvas/EditorCanvas';
import type { NodeDynamicDisplay } from '@/canvas/node-display-context';
import type { ActivePack } from '@/data/pack-runtime';
import { resolveIssueFocusPoint } from '@/lib/viewport-focus';
import type { SchemeIssue } from '@/scheme-check/check-scheme';
import type { TfgpEdge, TfgpNode } from '@/schema/tfgp';
import type { FocusSelectionParams } from '@/hooks/useEditorSelection';

export function useSchemeIssues(params: {
  schemeNodes: TfgpNode[];
  schemeEdges: TfgpEdge[];
  pack: ActivePack | null;
  layoutWidthByNodeId: Record<string, number>;
  nodeDisplayById: Record<string, NodeDynamicDisplay>;
  canvasRef: RefObject<EditorCanvasHandle | null>;
  focusSelection: (params: FocusSelectionParams) => void;
}) {
  const {
    schemeNodes,
    schemeEdges,
    pack,
    layoutWidthByNodeId,
    nodeDisplayById,
    canvasRef,
    focusSelection,
  } = params;

  const handleFocusIssue = useCallback(
    (issue: SchemeIssue) => {
      if (issue.edgeId) {
        const edge = schemeEdges.find((e) => e.id === issue.edgeId);
        focusSelection({
          nodeIds: edge
            ? [edge.source, edge.target]
            : issue.nodeId
              ? [issue.nodeId]
              : [],
          edgeIds: [issue.edgeId],
        });
        return;
      }
      if (issue.nodeId) {
        focusSelection({ nodeIds: [issue.nodeId], edgeIds: [] });
        return;
      }
      const nodeIdsRaw = issue.context?.nodeIds;
      if (nodeIdsRaw) {
        const ids = nodeIdsRaw
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        if (ids.length > 0) {
          focusSelection({ nodeIds: ids, edgeIds: [] });
        }
      }
    },
    [schemeEdges, focusSelection],
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
