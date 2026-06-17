import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from '@xyflow/react';

export interface FlowEdgeData {
  unified?: string;
  source?: string;
  target?: string;
  [key: string]: unknown;
}

export function FlowEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  markerEnd,
  style,
}: EdgeProps) {
  const d = (data ?? {}) as FlowEdgeData;
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  const showDual = Boolean(d.source && d.target && !d.unified);

  return (
    <>
      <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} style={style} />
      <EdgeLabelRenderer>
        {d.unified && (
          <div
            className="flow-edge-label flow-edge-label--unified"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            }}
          >
            {d.unified}
          </div>
        )}
        {showDual && d.source && (
          <div
            className="flow-edge-label flow-edge-label--source"
            style={{
              transform: `translate(-50%, -50%) translate(${sourceX + (targetX - sourceX) * 0.12}px, ${sourceY + (targetY - sourceY) * 0.12}px)`,
            }}
          >
            {d.source}
          </div>
        )}
        {showDual && d.target && (
          <div
            className="flow-edge-label flow-edge-label--target"
            style={{
              transform: `translate(-50%, -50%) translate(${sourceX + (targetX - sourceX) * 0.88}px, ${sourceY + (targetY - sourceY) * 0.88}px)`,
            }}
          >
            {d.target}
          </div>
        )}
      </EdgeLabelRenderer>
    </>
  );
}
