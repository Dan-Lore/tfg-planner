import { memo, useCallback, useEffect, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  applyNodeChanges,
  ConnectionMode,
  type Connection,
  type Edge,
  type EdgeTypes,
  type Node,
  type NodeChange,
  type NodeTypes,
  type OnSelectionChangeParams,
} from '@xyflow/react';
import { mergeFlowNodes } from '@/lib/merge-flow-nodes';

export type EditorCanvasProps = {
  rfNodes: Node[];
  rfEdges: Edge[];
  nodeTypes: NodeTypes;
  edgeTypes: EdgeTypes;
  colorTheme: 'light' | 'dark' | 'system';
  defaultViewport: { x: number; y: number; zoom: number };
  onPersistNodePositions: (nodes: Node[]) => void;
  onConnect: (conn: Connection) => void;
  isValidConnection: (conn: Connection | Edge) => boolean;
  onSelectionChange: (params: OnSelectionChangeParams) => void;
  onPaneClick: () => void;
  onNodeClick: () => void;
  onMoveEnd: (viewport: { x: number; y: number; zoom: number }) => void;
};

function EditorCanvasComponent({
  rfNodes,
  rfEdges,
  nodeTypes,
  edgeTypes,
  colorTheme,
  defaultViewport,
  onPersistNodePositions,
  onConnect,
  isValidConnection,
  onSelectionChange,
  onPaneClick,
  onNodeClick,
  onMoveEnd,
}: EditorCanvasProps) {
  const [flowNodes, setFlowNodes] = useState<Node[]>([]);

  useEffect(() => {
    setFlowNodes((prev) => mergeFlowNodes(prev, rfNodes));
  }, [rfNodes]);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      setFlowNodes((current) => applyNodeChanges(changes, current));

      const dragEnded = changes.some(
        (c) => c.type === 'position' && c.dragging === false,
      );
      if (!dragEnded) return;

      setFlowNodes((current) => {
        onPersistNodePositions(current);
        return current;
      });
    },
    [onPersistNodePositions],
  );

  return (
    <ReactFlow
      nodes={flowNodes}
      edges={rfEdges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      colorMode={colorTheme}
      onNodesChange={onNodesChange}
      onEdgesChange={() => {}}
      onConnect={onConnect}
      isValidConnection={isValidConnection}
      onSelectionChange={onSelectionChange}
      onPaneClick={onPaneClick}
      onNodeClick={onNodeClick}
      onMoveEnd={(_, vp) => onMoveEnd(vp)}
      defaultViewport={defaultViewport}
      nodesDraggable
      nodeDragThreshold={1}
      elevateNodesOnSelect
      connectionMode={ConnectionMode.Loose}
    >
      <Background />
      <Controls />
      <MiniMap
        className="editor-minimap"
        pannable
        zoomable
        maskColor="var(--minimap-mask)"
        maskStrokeColor="var(--minimap-viewport-stroke)"
        maskStrokeWidth={1.25}
        nodeColor="var(--minimap-node)"
        nodeStrokeWidth={0}
        bgColor="var(--minimap-bg)"
      />
    </ReactFlow>
  );
}

export const EditorCanvas = memo(EditorCanvasComponent);
