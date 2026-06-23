import type { FlowResult } from '@/calculator/flow-solver';
import { formatLoadPercent, formatRate, portInputDemandRate } from '@/calculator/flow-solver';
import { R } from '@/calculator/rational';
import type { FlowEdgeData } from '@/canvas/FlowEdge';
import type { PackData, Recipe } from '@/data/types';
import { getItemName } from '@/data/pack-registry';
import { normalizePortId, parsePortId, portFlow, productKey, inputPortId } from '@/canvas/ports';
import {
  formatFlowRateLabel,
  isChancedFlow,
} from '@/lib/flow-chance';
import type { TfgpEdge, TfgpNode } from '@/schema/tfgp';
import {
  MACHINE_NODE_WIDTH,
  PORT_ROW_HEIGHT,
  estimateHeaderHeight,
} from '@/canvas/node-bounds';

/** Estimate handle center from node layout (matches MachineNode content box). */
function estimatePortCenter(
  pack: PackData,
  node: TfgpNode,
  port: string,
  nodeWidth = MACHINE_NODE_WIDTH,
): { x: number; y: number } {
  const parsed = parsePortId(normalizePortId(port));
  if (!parsed) {
    return { x: node.position.x, y: node.position.y };
  }
  const portsTopY =
    estimateHeaderHeight(pack, node.machineId, node.recipeId) + node.position.y;
  const y = portsTopY + parsed.index * PORT_ROW_HEIGHT + PORT_ROW_HEIGHT / 2;
  const x =
    parsed.kind === 'in'
      ? node.position.x
      : node.position.x + nodeWidth;
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
  return `${edge.target}\0${normalizePortId(edge.targetPort)}`;
}

/** One source label per physical output handle — sum all fan-out edges. */
function sourceFlowGroupKey(edge: TfgpEdge): string {
  return `${edge.source}\0${normalizePortId(edge.sourcePort)}`;
}

function buildLabelWinners(
  edges: TfgpEdge[],
  nodes: TfgpNode[],
  pack: PackData,
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
  pack: PackData,
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
    const recipe = node
      ? pack.recipes.find((r) => r.id === node.recipeId)
      : undefined;
    const flow = portFlow(recipe, edge.sourcePort);
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

    entry.target = `${formatRate(totalFlow)}/s`;
  }
}

export function buildEdgeFlowData(
  edges: TfgpEdge[],
  nodes: TfgpNode[],
  pack: PackData,
  result: FlowResult,
  nodeWidths?: Record<string, number>,
): Record<string, FlowEdgeData> {
  const data: Record<string, FlowEdgeData> = {};

  for (const edge of edges) {
    const key = productKey(edge);
    if (!key) continue;

    const flow = result.edgeFlows[edge.id];
    if (!flow || flow.compare(R.zero) <= 0) continue;

    const node = nodes.find((n) => n.id === edge.source);
    const recipe = node
      ? pack.recipes.find((r) => r.id === node.recipeId)
      : undefined;
    const sourceFlow = portFlow(recipe, edge.sourcePort);
    const srcApprox = sourceFlow ? isChancedFlow(sourceFlow) : false;
    const label = formatFlowRateLabel(flow, srcApprox);

    data[edge.id] = {
      source: label,
      target: `${formatRate(flow)}/s`,
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

export interface NodeBalanceLine {
  kind: 'in' | 'out';
  text: string;
}

export function buildNodeBalanceLines(
  nodeId: string,
  recipe: Recipe | undefined,
  _connectedInPorts: Set<string>,
  result: FlowResult,
  pack: PackData,
  lang: 'ru' | 'en',
): NodeBalanceLine[] {
  const lines: NodeBalanceLine[] = [];
  if (!recipe) return lines;

  const portDeficit = result.nodePortDeficit[nodeId];
  if (portDeficit) {
    for (let i = 0; i < recipe.inputs.length; i++) {
      const portId = inputPortId(i);
      const deficit = portDeficit[portId];
      if (!deficit || deficit.compare(R.zero) <= 0) continue;
      const inp = recipe.inputs[i]!;
      const name = getItemName(pack, inp.itemId ?? inp.fluidId ?? '?', lang);
      lines.push({ kind: 'in', text: `-${formatRate(deficit)}/s ${name}` });
    }
  }

  const surplus = result.nodeSurplus[nodeId];
  if (surplus) {
    for (const [key, rate] of Object.entries(surplus)) {
      const resourceId = key.replace(/^(item|fluid):/, '');
      const name = getItemName(pack, resourceId, lang);
      lines.push({ kind: 'out', text: `+${formatRate(rate)}/s ${name}` });
    }
  }

  return lines;
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

export interface PortLoadMeta {
  loadPercent: number;
  title: string;
}

export interface NodeLoadMeta {
  loadPercent: number;
  label: string;
  title: string;
}

export function buildInputPortLoadMeta(
  nodeId: string,
  recipe: Recipe | undefined,
  connectedIn: Set<string>,
  result: FlowResult,
  t: (key: string, opts?: Record<string, string>) => string,
): Record<string, PortLoadMeta> {
  const meta: Record<string, PortLoadMeta> = {};
  if (!recipe || recipe.inputs.length === 0) return meta;

  const theoreticalPrimary =
    result.nodePortOutputRates[nodeId]?.['out_0'] ?? R.zero;
  const portLoads = result.nodePortInLoad[nodeId] ?? {};

  for (let i = 0; i < recipe.inputs.length; i++) {
    const portId = inputPortId(i);
    const demand = portInputDemandRate(recipe, i, theoreticalPrimary);
    if (demand.compare(R.zero) <= 0) continue;

    const connected = connectedIn.has(portId);
    const loadFraction = connected
      ? (portLoads[portId] ?? R.zero)
      : R.zero;
    const loadPercent = Math.min(
      100,
      Math.max(0, loadFraction.mul(R.from(100)).toNumber()),
    );
    const received = demand.mul(loadFraction);

    meta[portId] = {
      loadPercent,
      title: connected
        ? t('editor.portLoadTitle', {
            load: formatLoadPercent(loadFraction),
            received: `${formatRate(received)}/s`,
            demand: `${formatRate(demand)}/s`,
          })
        : t('editor.portLoadOpenTitle', {
            load: formatLoadPercent(loadFraction),
            demand: `${formatRate(demand)}/s`,
          }),
    };
  }

  return meta;
}

export function buildOutputPortLoadMeta(
  nodeId: string,
  recipe: Recipe | undefined,
  connectedOut: Set<string>,
  result: FlowResult,
  t: (key: string, opts?: Record<string, string>) => string,
): Record<string, PortLoadMeta> {
  const meta: Record<string, PortLoadMeta> = {};
  if (!recipe || recipe.outputs.length === 0) return meta;

  const portLoads = result.nodePortOutLoad[nodeId] ?? {};
  const portRates = result.nodePortOutputRates[nodeId] ?? {};

  for (let i = 0; i < recipe.outputs.length; i++) {
    const portId = `out_${i}`;
    const produced = portRates[portId] ?? R.zero;
    if (produced.compare(R.zero) <= 0) continue;

    const connected = connectedOut.has(portId);
    const loadFraction = connected ? (portLoads[portId] ?? R.zero) : R.zero;
    const loadPercent = Math.min(
      100,
      Math.max(0, loadFraction.mul(R.from(100)).toNumber()),
    );
    const sent = produced.mul(loadFraction);

    meta[portId] = {
      loadPercent,
      title: connected
        ? t('editor.portOutLoadTitle', {
            load: formatLoadPercent(loadFraction),
            sent: `${formatRate(sent)}/s`,
            produced: `${formatRate(produced)}/s`,
          })
        : t('editor.portOutLoadOpenTitle', {
            load: formatLoadPercent(loadFraction),
            produced: `${formatRate(produced)}/s`,
          }),
    };
  }

  return meta;
}

export function buildNodeLoadMeta(
  nodeId: string,
  recipe: Recipe | undefined,
  result: FlowResult,
  t: (key: string, opts?: Record<string, string>) => string,
): NodeLoadMeta | undefined {
  const loadFraction = result.nodeLoad[nodeId];
  if (loadFraction === undefined) return undefined;

  const loadPercent = Math.min(
    100,
    Math.max(0, loadFraction.mul(R.from(100)).toNumber()),
  );
  const loadStr = formatLoadPercent(loadFraction);

  if (!recipe || recipe.inputs.length === 0) {
    return {
      loadPercent,
      label: t('editor.nodeOutputLoadMeta', { value: loadStr }),
      title: t('editor.nodeOutputLoadTitle', { load: loadStr }),
    };
  }

  return {
    loadPercent,
    label: t('editor.nodeLoadMeta', { value: loadStr }),
    title: t('editor.nodeLoadTitle', { load: loadStr }),
  };
}
