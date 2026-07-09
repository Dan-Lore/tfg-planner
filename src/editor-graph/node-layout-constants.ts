export const MACHINE_NODE_WIDTH = 220;
export const MACHINE_NODE_MIN_WIDTH = 200;
export const CUSTOM_MACHINE_WIDTH_FACTOR = 2.5;
export const CUSTOM_MACHINE_NODE_MIN_WIDTH = Math.round(
  MACHINE_NODE_MIN_WIDTH * CUSTOM_MACHINE_WIDTH_FACTOR,
);
export const CUSTOM_MACHINE_NODE_WIDTH = Math.round(
  MACHINE_NODE_WIDTH * CUSTOM_MACHINE_WIDTH_FACTOR,
);
export const BUFFER_NODE_WIDTH = 200;

/** React Flow node.style — use instead of node.width with onlyRenderVisibleElements. */
export function machineNodeRfStyle(
  layoutWidth: number | undefined,
): { width: number; minWidth: number } | undefined {
  if (layoutWidth == null || layoutWidth <= 0) return undefined;
  return { width: layoutWidth, minWidth: layoutWidth };
}

export const PORT_ROW_HEIGHT = 24;
export const PORT_SECTION_PADDING = 6;
export const NODE_HEADER_MIN = 48;
export const EDGE_ROUTE_PADDING = 8;

export interface NodeRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}
