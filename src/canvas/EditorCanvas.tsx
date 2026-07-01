import { memo, useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  applyNodeChanges,
  ConnectionMode,
  useNodesInitialized,
  type Connection,
  type Edge,
  type EdgeTypes,
  type Node,
  type NodeChange,
  type NodeTypes,
  type OnEdgesDelete,
  type OnNodesDelete,
  type OnSelectionChangeParams,
} from '@xyflow/react';
import { mergeFlowNodes, applyFlowNodeSelection, applyFlowEdgeSelection } from '@/lib/merge-flow-nodes';
import {
  NodeInternalsGateProvider,
  useInternalsHold,
} from '@/canvas/node-internals-gate';
import {
  ObstacleRectsProvider,
  type ObstacleRectsContextValue,
} from '@/canvas/obstacle-rects-context';
import { edgeHandlesReady } from '@/lib/scheme-port-ids';

function portTopologyKey(nodes: Node[]): string {
  return nodes
    .map((n) => {
      const d = n.data as
        | { inputPortIds?: string[]; outputPortIds?: string[] }
        | undefined;
      return `${n.id}:${(d?.inputPortIds ?? []).join(',')}|${(d?.outputPortIds ?? []).join(',')}`;
    })
    .join(';');
}

export type EditorCanvasProps = {
  rfNodes: Node[];
  rfEdges: Edge[];
  selectedNodeIds: string[];
  selectedEdgeIds: string[];
  nodeTypes: NodeTypes;
  edgeTypes: EdgeTypes;
  colorTheme: 'light' | 'dark' | 'system';
  viewport: { x: number; y: number; zoom: number };
  obstacleRects: ObstacleRectsContextValue;
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

function EdgeReadinessBridge({
  topologyKey,
  onReadyChange,
}: {
  topologyKey: string;
  onReadyChange: (ready: boolean) => void;
}) {
  const nodesInitialized = useNodesInitialized();

  useLayoutEffect(() => {
    onReadyChange(false);
  }, [topologyKey, onReadyChange]);

  useLayoutEffect(() => {
    if (!nodesInitialized) {
      onReadyChange(false);
      return;
    }
    let cancelled = false;
    let frame2 = 0;
    const frame1 = requestAnimationFrame(() => {
      frame2 = requestAnimationFrame(() => {
        if (!cancelled) onReadyChange(true);
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame1);
      cancelAnimationFrame(frame2);
      onReadyChange(false);
    };
  }, [nodesInitialized, topologyKey, onReadyChange]);

  return null;
}

type EditorCanvasBodyProps = {
  flowNodes: Node[];
  flowEdges: Edge[];
  nodeTypes: NodeTypes;
  edgeTypes: EdgeTypes;
  colorTheme: 'light' | 'dark' | 'system';
  onNodesChange: (changes: NodeChange[]) => void;
  onConnect: (conn: Connection) => void;
  isValidConnection: (conn: Connection | Edge) => boolean;
  onSelectionChange: (params: OnSelectionChangeParams) => void;
  onNodesDelete: OnNodesDelete;
  onEdgesDelete: OnEdgesDelete;
  onPaneClick: () => void;
  onNodeClick: () => void;
  onMoveEnd: (viewport: { x: number; y: number; zoom: number }) => void;
  flowViewport: { x: number; y: number; zoom: number };
  setFlowViewport: (vp: { x: number; y: number; zoom: number }) => void;
  isDragging: boolean;
  edgesReady: boolean;
  onEdgesReadyChange: (ready: boolean) => void;
  topologyKey: string;
  obstacleContext: ObstacleRectsContextValue;
};

function EditorCanvasBody({
  flowNodes,
  flowEdges,
  nodeTypes,
  edgeTypes,
  colorTheme,
  onNodesChange,
  onConnect,
  isValidConnection,
  onSelectionChange,
  onNodesDelete,
  onEdgesDelete,
  onPaneClick,
  onNodeClick,
  onMoveEnd,
  flowViewport,
  setFlowViewport,
  isDragging,
  edgesReady,
  onEdgesReadyChange,
  topologyKey,
  obstacleContext,
}: EditorCanvasBodyProps) {
  const internalsHold = useInternalsHold();
  const handlesReady = edgeHandlesReady(flowNodes, flowEdges);
  const visibleEdges =
    edgesReady && !internalsHold && handlesReady ? flowEdges : [];

  return (
    <ObstacleRectsProvider value={obstacleContext}>
      <ReactFlow
        nodes={flowNodes}
        edges={visibleEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        colorMode={colorTheme}
        onNodesChange={onNodesChange}
        onConnect={onConnect}
        isValidConnection={isValidConnection}
        onSelectionChange={onSelectionChange}
        onNodesDelete={onNodesDelete}
        onEdgesDelete={onEdgesDelete}
        deleteKeyCode={['Delete', 'Backspace']}
        onPaneClick={onPaneClick}
        onNodeClick={onNodeClick}
        onMoveEnd={(_, vp) => onMoveEnd(vp)}
        viewport={flowViewport}
        onViewportChange={setFlowViewport}
        nodesDraggable
        nodeDragThreshold={1}
        elevateNodesOnSelect
        connectionMode={ConnectionMode.Loose}
      >
        <EdgeReadinessBridge
          topologyKey={topologyKey}
          onReadyChange={onEdgesReadyChange}
        />
        <Background />
        <Controls />
        {!isDragging && (
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
        )}
      </ReactFlow>
    </ObstacleRectsProvider>
  );
}

function EditorCanvasComponent({
  rfNodes,
  rfEdges,
  selectedNodeIds,
  selectedEdgeIds,
  nodeTypes,
  edgeTypes,
  colorTheme,
  viewport,
  obstacleRects,
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
  const [flowNodes, setFlowNodes] = useState<Node[]>(() => rfNodes);
  const [flowEdges, setFlowEdges] = useState<Edge[]>(() => rfEdges);
  const draggingNodeIdsRef = useRef(new Set<string>());
  const [isDragging, setIsDragging] = useState(false);
  const [flowViewport, setFlowViewport] = useState(viewport);
  const [edgesReady, setEdgesReady] = useState(false);

  const onEdgesReadyChange = useCallback((ready: boolean) => {
    setEdgesReady(ready);
  }, []);

  const topologyKey = useMemo(() => portTopologyKey(rfNodes), [rfNodes]);

  useLayoutEffect(() => {
    setFlowViewport(viewport);
  }, [viewport.x, viewport.y, viewport.zoom]);

  useLayoutEffect(() => {
    setFlowNodes((prev) => {
      const merged = mergeFlowNodes(prev, rfNodes, draggingNodeIdsRef.current);
      return applyFlowNodeSelection(merged, selectedNodeIds);
    });
    setFlowEdges(applyFlowEdgeSelection(rfEdges, selectedEdgeIds));
  }, [rfNodes, rfEdges, selectedNodeIds, selectedEdgeIds]);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      for (const change of changes) {
        if (change.type === 'position' && change.id) {
          if (change.dragging) {
            draggingNodeIdsRef.current.add(change.id);
            setIsDragging(true);
          } else {
            draggingNodeIdsRef.current.delete(change.id);
            if (draggingNodeIdsRef.current.size === 0) {
              setIsDragging(false);
            }
          }
        }
      }

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

  const obstacleContext = useMemo<ObstacleRectsContextValue>(
    () => ({
      obstacles: obstacleRects.obstacles,
      skipObstacleRouting: isDragging || obstacleRects.skipObstacleRouting,
    }),
    [obstacleRects, isDragging],
  );

  return (
    <NodeInternalsGateProvider>
      <EditorCanvasBody
        flowNodes={flowNodes}
        flowEdges={flowEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        colorTheme={colorTheme}
        onConnect={onConnect}
        isValidConnection={isValidConnection}
        onSelectionChange={onSelectionChange}
        onNodesDelete={onNodesDelete}
        onEdgesDelete={onEdgesDelete}
        onPaneClick={onPaneClick}
        onNodeClick={onNodeClick}
        onMoveEnd={onMoveEnd}
        onNodesChange={onNodesChange}
        isDragging={isDragging}
        flowViewport={flowViewport}
        setFlowViewport={setFlowViewport}
        edgesReady={edgesReady}
        onEdgesReadyChange={onEdgesReadyChange}
        topologyKey={topologyKey}
        obstacleContext={obstacleContext}
      />
    </NodeInternalsGateProvider>
  );
}

export const EditorCanvas = memo(EditorCanvasComponent);
