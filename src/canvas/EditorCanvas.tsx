import {
  forwardRef,
  memo,
  useCallback,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  applyNodeChanges,
  applyEdgeChanges,
  ConnectionMode,
  useNodesInitialized,
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
import { mergeFlowNodes, mergeFlowEdges, applyFlowNodeSelection, applyFlowEdgeSelection } from '@/lib/merge-flow-nodes';
import {
  NodeInternalsGateProvider,
  useInternalsHold,
} from '@/canvas/node-internals-gate';
import {
  ObstacleRectsProvider,
  type ObstacleRectsContextValue,
} from '@/canvas/obstacle-rects-context';
import { edgeHandlesReady } from '@/lib/scheme-port-ids';
import { shiftObstaclesForDragging } from '@/canvas/scheme-obstacles';
import { ObstacleDebugOverlay } from '@/canvas/ObstacleDebugOverlay';
import {
  animateViewport,
  viewportToCenterOn,
  type ViewportState,
} from '@/lib/viewport-focus';

const DEFAULT_PAN_DURATION_MS = 400;

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
  viewport: ViewportState;
  obstacleRects: ObstacleRectsContextValue;
  onPersistNodePositions: (nodes: Node[]) => void;
  onConnect: (conn: Connection) => void;
  isValidConnection: (conn: Connection | Edge) => boolean;
  onSelectionChange: (params: OnSelectionChangeParams) => void;
  onNodesDelete: OnNodesDelete;
  onEdgesDelete: OnEdgesDelete;
  onPaneClick: () => void;
  onNodeClick: () => void;
  onMoveEnd: (viewport: ViewportState) => void;
};

export interface EditorCanvasHandle {
  panToPoint: (x: number, y: number, options?: { duration?: number }) => void;
}

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
  selectedNodeIds: string[];
  nodeTypes: NodeTypes;
  edgeTypes: EdgeTypes;
  colorTheme: 'light' | 'dark' | 'system';
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (conn: Connection) => void;
  isValidConnection: (conn: Connection | Edge) => boolean;
  onSelectionChange: (params: OnSelectionChangeParams) => void;
  onNodesDelete: OnNodesDelete;
  onEdgesDelete: OnEdgesDelete;
  onPaneClick: () => void;
  onNodeClick: () => void;
  onMoveEnd: (viewport: ViewportState) => void;
  flowViewport: ViewportState;
  setFlowViewport: (vp: ViewportState) => void;
  isDragging: boolean;
  edgesReady: boolean;
  onEdgesReadyChange: (ready: boolean) => void;
  topologyKey: string;
  obstacleContext: ObstacleRectsContextValue;
};

function EditorCanvasBody({
  flowNodes,
  flowEdges,
  selectedNodeIds,
  nodeTypes,
  edgeTypes,
  colorTheme,
  onNodesChange,
  onEdgesChange,
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

  const selectedSet = useMemo(() => new Set(selectedNodeIds), [selectedNodeIds]);

  const minimapNodeColor = useCallback(
    (node: Node) =>
      selectedSet.has(node.id) ? 'var(--minimap-node-selected)' : 'var(--minimap-node)',
    [selectedSet],
  );

  const minimapNodeStrokeColor = useCallback(
    (node: Node) =>
      selectedSet.has(node.id) ? 'var(--minimap-viewport-stroke)' : 'transparent',
    [selectedSet],
  );

  return (
    <ObstacleRectsProvider value={obstacleContext}>
      <ReactFlow
        nodes={flowNodes}
        edges={visibleEdges}
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
        {/* DEBUG: подсветка obstacle rects — удалить после оценки padding */}
        <ObstacleDebugOverlay />
        <Controls />
        {!isDragging && (
          <MiniMap
            className="editor-minimap"
            pannable
            zoomable
            maskColor="var(--minimap-mask)"
            maskStrokeColor="var(--minimap-viewport-stroke)"
            maskStrokeWidth={1.25}
            nodeColor={minimapNodeColor}
            nodeStrokeColor={minimapNodeStrokeColor}
            nodeStrokeWidth={2}
            bgColor="var(--minimap-bg)"
          />
        )}
      </ReactFlow>
    </ObstacleRectsProvider>
  );
}

const EditorCanvasComponent = forwardRef<EditorCanvasHandle, EditorCanvasProps>(
  function EditorCanvasComponent(
    {
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
    },
    ref,
  ) {
    const wrapRef = useRef<HTMLDivElement>(null);
    const [flowNodes, setFlowNodes] = useState<Node[]>(() =>
      applyFlowNodeSelection(rfNodes, selectedNodeIds),
    );
    const [flowEdges, setFlowEdges] = useState<Edge[]>(() =>
      applyFlowEdgeSelection(rfEdges, selectedEdgeIds),
    );
    const draggingNodeIdsRef = useRef(new Set<string>());
    const [isDragging, setIsDragging] = useState(false);
    const [flowViewport, setFlowViewport] = useState(viewport);
    const [edgesReady, setEdgesReady] = useState(false);
    const flowViewportRef = useRef(flowViewport);
    const panCancelRef = useRef<(() => void) | null>(null);

    flowViewportRef.current = flowViewport;

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
      setFlowEdges((prev) => {
        const merged = mergeFlowEdges(prev, rfEdges);
        return applyFlowEdgeSelection(merged, selectedEdgeIds);
      });
    }, [rfNodes, rfEdges, selectedNodeIds, selectedEdgeIds]);

    useImperativeHandle(
      ref,
      () => ({
        panToPoint(x, y, options) {
          panCancelRef.current?.();
          const wrap = wrapRef.current;
          if (!wrap) return;
          const { width, height } = wrap.getBoundingClientRect();
          if (width <= 0 || height <= 0) return;

          const from = flowViewportRef.current;
          const to = viewportToCenterOn(
            { x, y },
            from.zoom,
            width,
            height,
          );
          const duration = options?.duration ?? DEFAULT_PAN_DURATION_MS;

          panCancelRef.current = animateViewport(
            from,
            to,
            duration,
            (vp) => setFlowViewport(vp),
            (vp) => {
              setFlowViewport(vp);
              onMoveEnd(vp);
              panCancelRef.current = null;
            },
          );
        },
      }),
      [onMoveEnd],
    );

    const onEdgesChange = useCallback((changes: EdgeChange[]) => {
      setFlowEdges((current) => applyEdgeChanges(changes, current));
    }, []);

    const onNodesChange = useCallback(
      (changes: NodeChange[]) => {
        for (const change of changes) {
          if (change.type === 'position' && change.id) {
            if (change.dragging) {
              if (!draggingNodeIdsRef.current.has(change.id)) {
                draggingNodeIdsRef.current.add(change.id);
                setIsDragging(true);
              }
            } else if (draggingNodeIdsRef.current.has(change.id)) {
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

    const obstacleContext = useMemo<ObstacleRectsContextValue>(() => {
      const obstacles = shiftObstaclesForDragging(
        obstacleRects.obstacles,
        flowNodes,
        rfNodes,
      );
      return {
        obstacles,
        skipObstacleRouting: obstacleRects.skipObstacleRouting,
      };
    }, [obstacleRects, flowNodes, rfNodes]);

    return (
      <div ref={wrapRef} className="editor-canvas-flow-host" style={{ width: '100%', height: '100%' }}>
        <NodeInternalsGateProvider>
          <EditorCanvasBody
            flowNodes={flowNodes}
            flowEdges={flowEdges}
            selectedNodeIds={selectedNodeIds}
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
            onEdgesChange={onEdgesChange}
            isDragging={isDragging}
            flowViewport={flowViewport}
            setFlowViewport={setFlowViewport}
            edgesReady={edgesReady}
            onEdgesReadyChange={onEdgesReadyChange}
            topologyKey={topologyKey}
            obstacleContext={obstacleContext}
          />
        </NodeInternalsGateProvider>
      </div>
    );
  },
);

export const EditorCanvas = memo(EditorCanvasComponent);
