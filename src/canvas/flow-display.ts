import type { FlowResult } from '@/calculator/flow-solver';
import { formatRate } from '@/calculator/flow-solver';
import type { FlowEdgeData } from '@/canvas/FlowEdge';
import type { PackData, Recipe } from '@/data/types';
import { getItemName } from '@/data/pack-registry';
import { normalizePortId, parsePortId, productKey } from '@/canvas/ports';
import type { TfgpEdge, TfgpNode } from '@/schema/tfgp';

const MACHINE_NODE_WIDTH = 200;
const PORT_ROW_HEIGHT = 28;
const NODE_HEADER_MIN = 48;

function recipeForNode(pack: PackData, node: TfgpNode): Recipe | undefined {
  return pack.recipes.find((r) => r.id === node.recipeId);
}

/** Estimate handle center from node layout (matches MachineNode min-height model). */
function estimatePortCenter(
  node: TfgpNode,
  port: string,
  recipe: Recipe | undefined,
): { x: number; y: number } {
  const parsed = parsePortId(normalizePortId(port));
  if (!parsed) {
    return { x: node.position.x, y: node.position.y };
  }
  const inCount = recipe?.inputs.length ?? 1;
  const outCount = recipe?.outputs.length ?? 1;
  const portCount = Math.max(inCount, outCount, 1);
  const bodyMinHeight = NODE_HEADER_MIN + portCount * PORT_ROW_HEIGHT;
  const portsTopY = node.position.y + bodyMinHeight - portCount * PORT_ROW_HEIGHT;
  const y = portsTopY + parsed.index * PORT_ROW_HEIGHT + PORT_ROW_HEIGHT / 2;
  const x =
    parsed.kind === 'in'
      ? node.position.x
      : node.position.x + MACHINE_NODE_WIDTH;
  return { x, y };
}

function distSq(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
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
  const key = productKey(edge);
  return key ? `${edge.target}\0${key}` : edge.target;
}

function buildLabelWinners(
  edges: TfgpEdge[],
  nodes: TfgpNode[],
  pack: PackData,
  data: Record<string, FlowEdgeData>,
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
      if (!outgoing.has(edge.source)) outgoing.set(edge.source, []);
      outgoing.get(edge.source)!.push(edge);
    }
  }

  const targetLabelEdge = new Map<string, string>();
  const sourceLabelEdge = new Map<string, string>();

  for (const [groupKey, group] of incoming) {
    if (group.length <= 1) continue;
    const nodeId = group[0]!.target;
    const node = nodeById.get(nodeId);
    const recipe = node ? recipeForNode(pack, node) : undefined;
    const winner = pickCentralEdge(group, (edge) => {
      const n = nodeById.get(edge.target);
      return n
        ? estimatePortCenter(n, edge.targetPort, recipe)
        : { x: 0, y: 0 };
    });
    if (winner) targetLabelEdge.set(groupKey, winner);
  }

  for (const [nodeId, group] of outgoing) {
    if (group.length <= 1) continue;
    const node = nodeById.get(nodeId);
    const recipe = node ? recipeForNode(pack, node) : undefined;
    const winner = pickCentralEdge(group, (edge) => {
      const n = nodeById.get(edge.source);
      return n
        ? estimatePortCenter(n, edge.sourcePort, recipe)
        : { x: 0, y: 0 };
    });
    if (winner) sourceLabelEdge.set(nodeId, winner);
  }

  return { targetLabelEdge, sourceLabelEdge };
}

function applyLabelDedup(
  data: Record<string, FlowEdgeData>,
  edges: TfgpEdge[],
  targetLabelEdge: Map<string, string>,
  sourceLabelEdge: Map<string, string>,
): void {
  for (const edge of edges) {
    const entry = data[edge.id];
    if (!entry) continue;

    const targetGroupKey = targetFlowGroupKey(edge);
    const dedupeTarget = targetLabelEdge.has(targetGroupKey);
    const dedupeSource = sourceLabelEdge.has(edge.source);
    const showTarget =
      !dedupeTarget || targetLabelEdge.get(targetGroupKey) === edge.id;
    const showSource =
      !dedupeSource || sourceLabelEdge.get(edge.source) === edge.id;

    if (!showSource) delete entry.source;
    if (!showTarget) delete entry.target;
    if (!entry.source && !entry.target) delete data[edge.id];
  }
}

export function buildEdgeFlowData(
  edges: TfgpEdge[],
  nodes: TfgpNode[],
  pack: PackData,
  result: FlowResult,
): Record<string, FlowEdgeData> {
  const data: Record<string, FlowEdgeData> = {};

  for (const edge of edges) {
    const key = productKey(edge);
    if (!key) continue;

    const srcRate = result.nodeOutputRates[edge.source]?.[key];
    const tgtRate = result.nodeInputRates[edge.target]?.[key];
    if (!srcRate && !tgtRate) continue;

    const srcText = srcRate ? `${formatRate(srcRate)}/s` : undefined;
    const tgtText = tgtRate ? `${formatRate(tgtRate)}/s` : undefined;

    data[edge.id] = {
      ...(srcText ? { source: srcText } : {}),
      ...(tgtText ? { target: tgtText } : {}),
    };
  }

  const { targetLabelEdge, sourceLabelEdge } = buildLabelWinners(
    edges,
    nodes,
    pack,
    data,
  );
  applyLabelDedup(data, edges, targetLabelEdge, sourceLabelEdge);

  return data;
}

export function buildNodeSurplusLines(
  nodeId: string,
  result: FlowResult,
  pack: PackData,
  lang: 'ru' | 'en',
): string[] {
  const surplus = result.nodeSurplus[nodeId];
  if (!surplus) return [];
  return Object.entries(surplus).map(([key, rate]) => {
    const resourceId = key.replace(/^(item|fluid):/, '');
    const name = getItemName(pack, resourceId, lang);
    return `+${formatRate(rate)}/s ${name}`;
  });
}

export function rateMapToStrings(
  rates: Record<string, import('@/calculator/rational').Rational> | undefined,
): Record<string, string> {
  if (!rates) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(rates)) {
    if (v.toNumber() > 0) out[k] = `${formatRate(v)}/s`;
  }
  return out;
}
