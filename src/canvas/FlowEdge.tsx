import { useState } from 'react';
import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from '@xyflow/react';
import { edgeLabelPosition } from '@/lib/bezier-edge-label';

export interface FlowEdgeData {
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
  selected,
}: EdgeProps) {
  const [hovered, setHovered] = useState(false);
  const d = (data ?? {}) as FlowEdgeData;
  const bezier = {
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  };
  const [edgePath] = getBezierPath(bezier);

  const sourceLabel = edgeLabelPosition(bezier, 'source', d.source);
  const targetLabel = edgeLabelPosition(bezier, 'target', d.target);

  const emphasized = selected || hovered;
  const round = (value: number) => Math.round(value);

  return (
    <g
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        interactionWidth={18}
        style={{
          ...style,
          strokeWidth: selected ? 2.5 : hovered ? 2 : undefined,
          stroke: emphasized ? 'var(--accent)' : undefined,
          transition: 'stroke 0.15s ease, stroke-width 0.15s ease',
        }}
      />
      <EdgeLabelRenderer>
        {d.source && (
          <div
            className="flow-edge-label flow-edge-label--source"
            style={{
              transform: `translate(-50%, -50%) translate(${round(sourceLabel.x)}px, ${round(sourceLabel.y)}px)`,
            }}
          >
            {d.source}
          </div>
        )}
        {d.target && (
          <div
            className="flow-edge-label flow-edge-label--target"
            style={{
              transform: `translate(-50%, -50%) translate(${round(targetLabel.x)}px, ${round(targetLabel.y)}px)`,
            }}
          >
            {d.target}
          </div>
        )}
      </EdgeLabelRenderer>
    </g>
  );
}
