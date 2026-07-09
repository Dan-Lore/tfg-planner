import { useCallback } from 'react';
import type { Connection, Edge } from '@xyflow/react';
import { nodePortFlow, portsMatch } from '@/canvas/ports';
import { getRecipe } from '@/data/pack-registry';
import type { PackLike } from '@/data/pack-registry';
import { isCustomMachineNode, isMachineNode } from '@/shared/node-kind';
import type { TagIndex } from '@/shared/tag-index';
import type { EditorActions } from '@/editor/editor-actions';
import type { TfgpNode } from '@/schema/tfgp';

export function useEditorConnections(params: {
  pack: PackLike | null;
  schemeNodes: TfgpNode[];
  tagIndex: TagIndex | null;
  addEdgeToStore: EditorActions['addEdge'];
  ensureCustomPort: EditorActions['ensureCustomPort'];
}) {
  const { pack, schemeNodes, tagIndex, addEdgeToStore, ensureCustomPort } = params;

  const isValidConnection = useCallback(
    (conn: Connection | Edge) => {
      if (!pack || !conn.source || !conn.target) return false;
      if (!conn.sourceHandle?.startsWith('out_')) return false;
      if (!conn.targetHandle?.startsWith('in_')) return false;
      const srcNode = schemeNodes.find((n) => n.id === conn.source);
      const tgtNode = schemeNodes.find((n) => n.id === conn.target);
      if (!srcNode || !tgtNode) return false;
      const srcRecipe =
        pack && isMachineNode(srcNode) ? getRecipe(pack, srcNode.recipeId) : undefined;
      const tgtRecipe =
        pack && isMachineNode(tgtNode) ? getRecipe(pack, tgtNode.recipeId) : undefined;
      const srcFlow = nodePortFlow(srcNode, conn.sourceHandle, srcRecipe);
      const tgtFlow = nodePortFlow(tgtNode, conn.targetHandle, tgtRecipe);
      if (srcFlow && !tgtFlow && isCustomMachineNode(tgtNode)) return true;
      if (!srcFlow && tgtFlow && isCustomMachineNode(srcNode)) return true;
      return portsMatch(srcFlow, tgtFlow, tagIndex ?? undefined);
    },
    [pack, schemeNodes, tagIndex],
  );

  const onConnect = useCallback(
    (conn: Connection) => {
      if (!conn.source || !conn.target || !conn.sourceHandle || !conn.targetHandle) {
        return;
      }
      if (!isValidConnection(conn)) return;
      const srcNode = schemeNodes.find((n) => n.id === conn.source);
      const tgtNode = schemeNodes.find((n) => n.id === conn.target);
      if (!srcNode || !tgtNode) return;

      const srcRecipe =
        pack && isMachineNode(srcNode) ? getRecipe(pack, srcNode.recipeId) : undefined;
      const tgtRecipe =
        pack && isMachineNode(tgtNode) ? getRecipe(pack, tgtNode.recipeId) : undefined;
      let srcFlow = nodePortFlow(srcNode, conn.sourceHandle, srcRecipe);
      let tgtFlow = nodePortFlow(tgtNode, conn.targetHandle, tgtRecipe);

      if (isCustomMachineNode(tgtNode) && srcFlow) {
        ensureCustomPort(tgtNode.id, conn.targetHandle, {
          itemId: srcFlow.itemId,
          fluidId: srcFlow.fluidId,
        });
        tgtFlow = srcFlow;
      }
      if (isCustomMachineNode(srcNode) && tgtFlow) {
        ensureCustomPort(srcNode.id, conn.sourceHandle, {
          itemId: tgtFlow.itemId,
          fluidId: tgtFlow.fluidId,
        });
        srcFlow = tgtFlow;
      }
      if (!srcFlow) return;

      addEdgeToStore({
        source: conn.source,
        target: conn.target,
        sourcePort: conn.sourceHandle,
        targetPort: conn.targetHandle,
        itemId: srcFlow.itemId,
        fluidId: srcFlow.fluidId,
      });
    },
    [pack, schemeNodes, addEdgeToStore, isValidConnection, ensureCustomPort],
  );

  return { isValidConnection, onConnect };
}
