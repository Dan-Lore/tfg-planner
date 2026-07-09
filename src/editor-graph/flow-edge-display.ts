import type { FlowResult } from '@/calculator';
import { R } from '@/calculator';
import type { FlowEdgeData } from '@/editor-graph/flow-edge-types';
import type { PackLike } from '@/data/pack-registry';
import { getRecipe } from '@/data/pack-registry';
import { normalizePortId, parsePortId, productKey } from '@/shared/ports';
import { nodePortFlow } from '@/shared/node-port-flow';
import { isBufferNode, isCustomMachineNode, isMachineNode } from '@/shared/node-kind';
import { formatFlowRateLabel, isChancedFlow } from '@/shared/flow-chance';
import type { TfgpEdge, TfgpNode } from '@/schema/tfgp';
import {
  BUFFER_NODE_WIDTH,
  MACHINE_NODE_WIDTH,
  PORT_ROW_HEIGHT,
} from '@/editor-graph/node-layout-constants';
import { estimateHeaderHeight } from '@/editor-graph/node-layout-estimates';


/** Estimate handle center from node layout (matches MachineNode content box). */
function estimatePortCenter(
  pack: PackLike,
  node: TfgpNode,
  port: string,
  nodeWidth = MACHINE_NODE_WIDTH,
): { x: number; y: number } {
  const parsed = parsePortId(normalizePortId(port));
  if (!parsed) {
    return { x: node.position.x, y: node.position.y };
  }
  let portsTopY = node.position.y + 48;
  let effectiveWidth = nodeWidth;
  if (isBufferNode(node)) {
    const header = 56;
    const fields = node.kind === 'start_buffer' ? 88 : 36;
    portsTopY = node.position.y + header + fields;
    effectiveWidth = BUFFER_NODE_WIDTH;
  } else if (isCustomMachineNode(node)) {
    portsTopY = node.position.y + 76;
  } else if (isMachineNode(node)) {
    portsTopY =
      estimateHeaderHeight(pack, node.machineId, node.recipeId) + node.position.y;
  }
  const y = portsTopY + parsed.index * PORT_ROW_HEIGHT + PORT_ROW_HEIGHT / 2;
  const x =
    parsed.kind === 'in'
      ? node.position.x
      : node.position.x + effectiveWidth;
  return { x, y };
}

function distSq(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

function edgePortApproximate(
  edge: TfgpEdge,
  nodes: TfgpNode[],
  pack: PackLike,
  side: 'source' | 'target',
): boolean {
  const nodeId = side === 'source' ? edge.source : edge.target;
  const port = side === 'source' ? edge.sourcePort : edge.targetPort;
  const node = nodes.find((n) => n.id === nodeId);
  if (!node) return false;
  const recipe = isMachineNode(node) ? getRecipe(pack, node.recipeId) : undefined;
  const flow = nodePortFlow(node, port, recipe);
  return flow ? isChancedFlow(flow) : false;
}

/** Edge closest to the centroid of port handles in the group. */
function pickCentralEdge(
  group: TfgpEdge[],
  portCenter: (edge: TfgpEdge) => { x: number; y: number },
): string | null {
  if (group.length === 0) return null;
  if (group.length === 1) return group[0]!.id;

  let avgX = 0;
  let avgY = 0;
  for (const edge of group) {
    const c = portCenter(edge);
    avgX += c.x;
    avgY += c.y;
  }
  avgX /= group.length;
  avgY /= group.length;

  let bestId = group[0]!.id;
  let bestDist = Infinity;
  for (const edge of group) {
    const c = portCenter(edge);
    const d = distSq(c.x, c.y, avgX, avgY);
    if (d < bestDist) {
      bestDist = d;
      bestId = edge.id;
    }
  }
  return bestId;
}

function targetFlowGroupKey(edge: TfgpEdge): string {
  return `${edge.target}\0${normalizePortId(edge.targetPort)}`;
}

/** One source label per physical output handle — sum all fan-out edges. */
function sourceFlowGroupKey(edge: TfgpEdge): string {
  return `${edge.source}\0${normalizePortId(edge.sourcePort)}`;
}

function buildLabelWinners(
  edges: TfgpEdge[],
  nodes: TfgpNode[],
  pack: PackLike,
  data: Record<string, FlowEdgeData>,
  nodeWidths?: Record<string, number>,
): {
  targetLabelEdge: Map<string, string>;
  sourceLabelEdge: Map<string, string>;
} {
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const incoming = new Map<string, TfgpEdge[]>();
  const outgoing = new Map<string, TfgpEdge[]>();

  for (const edge of edges) {
    const entry = data[edge.id];
    if (!entry) continue;
    const hasTarget = Boolean(entry.target);
    const hasSource = Boolean(entry.source);
    if (hasTarget) {
      const groupKey = targetFlowGroupKey(edge);
      if (!incoming.has(groupKey)) incoming.set(groupKey, []);
      incoming.get(groupKey)!.push(edge);
    }
    if (hasSource) {
      const groupKey = sourceFlowGroupKey(edge);
      if (!outgoing.has(groupKey)) outgoing.set(groupKey, []);
      outgoing.get(groupKey)!.push(edge);
    }
  }

  const targetLabelEdge = new Map<string, string>();
  const sourceLabelEdge = new Map<string, string>();

  for (const [groupKey, group] of incoming) {
    if (group.length <= 1) continue;
    const targetPort = normalizePortId(group[0]!.targetPort);
    const allSameTargetPort = group.every(
      (edge) => normalizePortId(edge.targetPort) === targetPort,
    );
    const winner = pickCentralEdge(group, (edge) => {
      if (allSameTargetPort) {
        const n = nodeById.get(edge.source);
        return n
          ? estimatePortCenter(
              pack,
              n,
              edge.sourcePort,
              nodeWidths?.[n.id] ?? MACHINE_NODE_WIDTH,
            )
          : { x: 0, y: 0 };
      }
      const n = nodeById.get(edge.target);
      return n
        ? estimatePortCenter(
            pack,
            n,
            edge.targetPort,
            nodeWidths?.[n.id] ?? MACHINE_NODE_WIDTH,
          )
        : { x: 0, y: 0 };
    });
    if (winner) targetLabelEdge.set(groupKey, winner);
  }

  for (const [groupKey, group] of outgoing) {
    if (group.length <= 1) continue;
    const winner = pickCentralEdge(group, (edge) => {
      const n = nodeById.get(edge.source);
      return n
        ? estimatePortCenter(
            pack,
            n,
            edge.sourcePort,
            nodeWidths?.[n.id] ?? MACHINE_NODE_WIDTH,
          )
        : { x: 0, y: 0 };
    });
    if (winner) sourceLabelEdge.set(groupKey, winner);
  }

  return { targetLabelEdge, sourceLabelEdge };
}

function applyLabelDedup(
  data: Record<string, FlowEdgeData>,
  edges: TfgpEdge[],
  nodes: TfgpNode[],
  pack: PackLike,
  targetLabelEdge: Map<string, string>,
  sourceLabelEdge: Map<string, string>,
  result: FlowResult,
): void {
  for (const edge of edges) {
    const entry = data[edge.id];
    if (!entry) continue;

    const targetGroupKey = targetFlowGroupKey(edge);
    const sourceGroupKey = sourceFlowGroupKey(edge);
    const dedupeTarget = targetLabelEdge.has(targetGroupKey);
    const dedupeSource = sourceLabelEdge.has(sourceGroupKey);
    const showTarget =
      !dedupeTarget || targetLabelEdge.get(targetGroupKey) === edge.id;
    const showSource =
      !dedupeSource || sourceLabelEdge.get(sourceGroupKey) === edge.id;

    if (!showSource) delete entry.source;
    if (!showTarget) delete entry.target;
    if (!entry.source && !entry.target) delete data[edge.id];
  }

  for (const winnerId of sourceLabelEdge.values()) {
    const entry = data[winnerId];
    const edge = edges.find((e) => e.id === winnerId);
    if (!entry?.source || !edge) continue;

    const sourceGroupKey = sourceFlowGroupKey(edge);
    let totalFlow = R.zero;
    for (const e of edges) {
      if (sourceFlowGroupKey(e) !== sourceGroupKey) continue;
      const flow = result.edgeFlows[e.id];
      if (flow) totalFlow = totalFlow.add(flow);
    }
    if (totalFlow.compare(R.zero) <= 0) continue;

    const node = nodes.find((n) => n.id === edge.source);
    const recipe = node && isMachineNode(node)
      ? getRecipe(pack, node.recipeId)
      : undefined;
    const flow = node ? nodePortFlow(node, edge.sourcePort, recipe) : null;
    entry.source = formatFlowRateLabel(
      totalFlow,
      flow ? isChancedFlow(flow) : false,
    );
  }

  for (const winnerId of targetLabelEdge.values()) {
    const entry = data[winnerId];
    const edge = edges.find((e) => e.id === winnerId);
    if (!entry?.target || !edge) continue;

    const targetGroupKey = targetFlowGroupKey(edge);
    let totalFlow = R.zero;
    for (const e of edges) {
      if (targetFlowGroupKey(e) !== targetGroupKey) continue;
      const flow = result.edgeFlows[e.id];
      if (flow) totalFlow = totalFlow.add(flow);
    }
    if (totalFlow.compare(R.zero) <= 0) continue;

    const tgtApprox = edgePortApproximate(edge, nodes, pack, 'target');
    entry.target = formatFlowRateLabel(totalFlow, tgtApprox);
  }
}

export function buildEdgeFlowData(
  edges: TfgpEdge[],
  nodes: TfgpNode[],
  pack: PackLike,
  result: FlowResult,
  nodeWidths?: Record<string, number>,
): Record<string, FlowEdgeData> {
  const data: Record<string, FlowEdgeData> = {};

  for (const edge of edges) {
    const key = productKey(edge);
    if (!key) continue;

    const flow = result.edgeFlows[edge.id];
    if (!flow || flow.compare(R.zero) <= 0) continue;

    const srcApprox = edgePortApproximate(edge, nodes, pack, 'source');
    const tgtApprox = edgePortApproximate(edge, nodes, pack, 'target');
    const label = formatFlowRateLabel(flow, srcApprox);

    data[edge.id] = {
      source: label,
      target: formatFlowRateLabel(flow, tgtApprox),
    };
  }

  const { targetLabelEdge, sourceLabelEdge } = buildLabelWinners(
    edges,
    nodes,
    pack,
    data,
    nodeWidths,
  );
  applyLabelDedup(
    data,
    edges,
    nodes,
    pack,
    targetLabelEdge,
    sourceLabelEdge,
    result,
  );

  return data;
}