import { memo, useCallback, useEffect, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  applyNodeChanges,
  applyEdgeChanges,
  ConnectionMode,
  type Connection,
  type Edge,
  type EdgeChange,
  type EdgeTypes,
  type Node,
  type NodeChange,
  type NodeTypes,
  type OnEdgesDelete,
  type OnNodesDelete,
  type OnSelectionChangeParams,
} from '@xyflow/react';
import { mergeFlowEdges } from '@/lib/merge-flow-edges';
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
  onNodesDelete: OnNodesDelete;
  onEdgesDelete: OnEdgesDelete;
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
  onNodesDelete,
  onEdgesDelete,
  onPaneClick,
  onNodeClick,
  onMoveEnd,
}: EditorCanvasProps) {
  const [flowNodes, setFlowNodes] = useState<Node[]>([]);
  const [flowEdges, setFlowEdges] = useState<Edge[]>([]);

  useEffect(() => {
    setFlowNodes((prev) => mergeFlowNodes(prev, rfNodes));
  }, [rfNodes]);

  useEffect(() => {
    setFlowEdges((prev) => mergeFlowEdges(prev, rfEdges));
  }, [rfEdges]);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      setFlowNodes((current) => applyNodeChanges(changes, current));

      const dragEnded = changes.some(
        (c) => c.type === 'position' && c.dragging === false,
      );
      if (!dragEnded) return;

      setFlowNodes((current) => {
        queueMicrotask(() => onPersistNodePositions(current));
        return current;
      });
    },
    [onPersistNodePositions],
  );

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    setFlowEdges((current) => applyEdgeChanges(changes, current));
  }, []);

  return (
    <ReactFlow
      nodes={flowNodes}
      edges={flowEdges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      colorMode={colorTheme}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      isValidConnection={isValidConnection}
      onSelectionChange={onSelectionChange}
      onNodesDelete={onNodesDelete}
      onEdgesDelete={onEdgesDelete}
      deleteKeyCode={['Delete', 'Backspace']}
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
