import type { TFunction } from 'i18next';
import type { FlowResult } from '@/calculator';
import {
  allowedTiersForRecipe,
  effectiveDurationTicks,
  effectiveEuPerTick,
  effectiveTotalEu,
  formatEuPerTick,
} from '@/calculator';
import type { VoltageTier } from '@/calculator';
import {
  CUSTOM_MACHINE_NODE_MIN_WIDTH,
  CUSTOM_MACHINE_WIDTH_FACTOR,
  MACHINE_NODE_MIN_WIDTH,
} from '@/editor-graph/node-layout-constants';
import {
  buildCustomMachinePortDisplaysForNode,
  buildMachinePortDisplaysForNode,
} from '@/editor-graph/layout-port-stubs';
import type { MachineLayoutData, PortDisplay } from '@/editor-graph/port-display-types';
import { formatLoadPercentDisplay } from '@/editor-graph/port-displays';
import type { PackLike } from '@/data/pack-registry';
import { getMachineName, getMachineRecipeCount, getRecipe } from '@/data/pack-registry';
import { formatRecipeLabel } from '@/lib/recipe-label';
import { formatRecipeDuration } from '@/lib/recipe-duration';
import type { TfgpCustomMachineNode, TfgpEdge, TfgpMachineNode, TfgpNode } from '@/schema/tfgp';
import { normalizePortId } from '@/shared/ports';
import { isMachineNode } from '@/shared/node-kind';

export function buildConnectedPortMaps(edges: TfgpEdge[]): {
  connectedIn: Map<string, Set<string>>;
  connectedOut: Map<string, Set<string>>;
} {
  const connectedIn = new Map<string, Set<string>>();
  const connectedOut = new Map<string, Set<string>>();
  for (const edge of edges) {
    if (!connectedOut.has(edge.source)) connectedOut.set(edge.source, new Set());
    if (!connectedIn.has(edge.target)) connectedIn.set(edge.target, new Set());
    connectedOut.get(edge.source)!.add(normalizePortId(edge.sourcePort));
    connectedIn.get(edge.target)!.add(normalizePortId(edge.targetPort));
  }
  return { connectedIn, connectedOut };
}

const FONT_STACK = 'system-ui, "Segoe UI", sans-serif';
const HEADER_PAD_X = 0.65 * 16 * 2;
const PORT_LABEL_MAX = 88;
const PORT_SIDE_PAD = 0.55 * 16;
const PORT_INNER_GAP = 0.25 * 16;
const PORTS_COL_GAP = 0.5 * 16;
const RECIPE_PICKER_MAX = 220;

const textWidthCache = new Map<string, number>();
let measureCtx: CanvasRenderingContext2D | null | undefined;

function rootFontPx(): number {
  if (typeof document === 'undefined') return 16;
  const px = parseFloat(getComputedStyle(document.documentElement).fontSize);
  return Number.isFinite(px) && px > 0 ? px : 16;
}

function getMeasureCtx(): CanvasRenderingContext2D | null {
  if (measureCtx !== undefined) return measureCtx;
  if (typeof document === 'undefined') {
    measureCtx = null;
    return null;
  }
  const canvas = document.createElement('canvas');
  measureCtx = canvas.getContext('2d');
  return measureCtx;
}

function measureTextWidth(text: string, fontSizeRem: number, weight = 400): number {
  const key = `${weight}\0${fontSizeRem}\0${text}`;
  const cached = textWidthCache.get(key);
  if (cached !== undefined) return cached;

  const sizePx = fontSizeRem * rootFontPx();
  const ctx = getMeasureCtx();
  let width: number;
  if (ctx) {
    ctx.font = `${weight} ${sizePx}px ${FONT_STACK}`;
    width = ctx.measureText(text).width;
  } else {
    width = text.length * sizePx * (weight >= 600 ? 0.62 : 0.56);
  }

  textWidthCache.set(key, width);
  return width;
}

function formatOverclock(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function formatTotalEu(value: number): string {
  if (value >= 1000) return `${Math.round(value)} EU`;
  if (Number.isInteger(value)) return `${value} EU`;
  return `${Math.round(value * 10) / 10} EU`;
}

function portColumnWidth(ports: PortDisplay[]): number {
  let max = 0;
  for (const port of ports) {
    const labelW = Math.min(measureTextWidth(port.label, 0.65), PORT_LABEL_MAX);
    const rateW = port.rate ? measureTextWidth(port.rate, 0.6, 600) : 0;
    const loadW = port.loadLabel
      ? measureTextWidth(formatLoadPercentDisplay(port.loadPercent ?? 0), 0.55, 700)
      : 0;
    max = Math.max(
      max,
      PORT_SIDE_PAD + labelW + PORT_INNER_GAP + rateW + (loadW > 0 ? PORT_INNER_GAP + loadW : 0),
    );
  }
  return max;
}

/** Estimate rendered width from node display data (matches `.machine-node` layout). */
export function estimateMachineNodeLayoutWidth(
  data: MachineLayoutData,
  lang: 'ru' | 'en' = 'ru',
): number {
  const title = getMachineName(data.pack, data.machineId, lang);
  const recipe = getRecipe(data.pack, data.recipeId);
  const recipeLabel = recipe ? formatRecipeLabel(data.pack, recipe, lang) : '';
  const hasRecipePicker = getMachineRecipeCount(data.pack, data.machineId) > 1;

  const titleW = measureTextWidth(title, 0.8, 600) + HEADER_PAD_X;
  const recipeW = hasRecipePicker
    ? Math.min(
        RECIPE_PICKER_MAX,
        measureTextWidth(recipeLabel, 0.65) + HEADER_PAD_X,
      )
    : 0;

  let metaW = 0;
  for (const line of data.balanceLines ?? []) {
    metaW = Math.max(metaW, measureTextWidth(line.text, 0.65, 600) + HEADER_PAD_X);
  }

  const inCol = portColumnWidth(data.inputPorts ?? []);
  const outCol = portColumnWidth(data.outputPorts ?? []);
  const portsW = inCol + PORTS_COL_GAP + outCol + HEADER_PAD_X;

  return Math.ceil(
    Math.max(MACHINE_NODE_MIN_WIDTH, titleW, recipeW, metaW, portsW),
  );
}

export interface BuildMachineNodeLayoutWidthsInput {
  nodes: TfgpNode[];
  edges?: TfgpEdge[];
  pack: PackLike;
  lang: 'ru' | 'en';
  flowResult?: FlowResult;
  connectedIn: Map<string, Set<string>>;
  connectedOut: Map<string, Set<string>>;
  t: TFunction;
}

export function computeNaturalLayoutWidthForMachineNode(
  node: TfgpMachineNode,
  input: BuildMachineNodeLayoutWidthsInput,
): number {
  const recipe = getRecipe(input.pack, node.recipeId);
  const edges = input.edges ?? [];
  const { inputPorts, outputPorts, balanceLines } = buildMachinePortDisplaysForNode(
    node,
    edges,
    input.pack,
    input.lang,
    input.connectedIn.get(node.id) ?? new Set(),
    input.connectedOut.get(node.id) ?? new Set(),
    input.flowResult,
    input.t,
  );

  const stubData: MachineLayoutData = {
    machineId: node.machineId,
    recipeId: node.recipeId,
    machineCount: node.machineCount,
    overclock: node.overclock,
    voltageTier: node.voltageTier as VoltageTier,
    pack: input.pack,
    inputPorts,
    outputPorts,
    balanceLines,
  };

  let width = estimateMachineNodeLayoutWidth(stubData, input.lang);

  if (recipe) {
    const allowedTiers = allowedTiersForRecipe(recipe);
    const metaParts = [
      input.t('editor.machinesMeta', { count: node.machineCount }),
      input.t('editor.overclockMeta', {
        value: formatOverclock(node.overclock),
      }),
    ];
    if (allowedTiers.length > 0) {
      metaParts.push(input.t('editor.tierMeta', { value: node.voltageTier }));
    }
    const ticks = effectiveDurationTicks(
      recipe,
      node.voltageTier as VoltageTier,
      node.overclock,
    );
    const duration = formatRecipeDuration(ticks, input.lang);
    if (duration) metaParts.push(duration);

    const metaW = measureTextWidth(metaParts.join(' · '), 0.7) + HEADER_PAD_X;
    width = Math.max(width, metaW);

    const euPerTick = effectiveEuPerTick(recipe, node.voltageTier as VoltageTier);
    if (euPerTick != null) {
      const totalEu = effectiveTotalEu(
        recipe,
        node.voltageTier as VoltageTier,
        node.overclock,
      );
      const energyLine =
        input.t('editor.energyMeta', { value: formatEuPerTick(euPerTick) }) +
        (totalEu != null
          ? ` · ${input.t('editor.totalEuMeta', { value: formatTotalEu(totalEu) })}`
          : '');
      width = Math.max(width, measureTextWidth(energyLine, 0.7) + HEADER_PAD_X);
    }
  }

  return width;
}

/** Layout width for custom_machine — at least 2.5× standard machine card. */
export function computeCustomMachineLayoutWidth(
  node: TfgpCustomMachineNode,
  input: BuildMachineNodeLayoutWidthsInput,
): number {
  const edges = input.edges ?? [];
  const emptyPortLabel = input.t('editor.customMachine.emptyPort');
  const { inputPorts, outputPorts } = buildCustomMachinePortDisplaysForNode(
    node,
    edges,
    input.pack,
    input.lang,
    input.connectedIn.get(node.id) ?? new Set(),
    input.connectedOut.get(node.id) ?? new Set(),
    input.flowResult,
    input.t,
    emptyPortLabel,
  );

  const title = node.label?.trim() || input.t('editor.customMachine.title');
  const titleW = measureTextWidth(title, 0.8, 600) + HEADER_PAD_X;
  const inCol = portColumnWidth(inputPorts);
  const outCol = portColumnWidth(outputPorts);
  const portsW = inCol + PORTS_COL_GAP + outCol + HEADER_PAD_X;

  const effectiveTicks = Math.round(
    node.durationTicks / Math.max(node.overclock, 0.1),
  );
  const duration = formatRecipeDuration(effectiveTicks, input.lang);
  const metaParts = [
    input.t('editor.machinesMeta', { count: node.machineCount }),
    input.t('editor.overclockMeta', { value: formatOverclock(node.overclock) }),
    duration,
  ];
  const metaW = measureTextWidth(metaParts.join(' · '), 0.7) + HEADER_PAD_X;

  const natural = Math.ceil(
    Math.max(MACHINE_NODE_MIN_WIDTH, titleW, portsW, metaW),
  );
  return Math.max(
    CUSTOM_MACHINE_NODE_MIN_WIDTH,
    Math.ceil(natural * CUSTOM_MACHINE_WIDTH_FACTOR),
  );
}

/** Max natural width for nodes sharing one machineId. */
export function computeGroupLayoutWidth(
  machineId: string,
  nodesInGroup: TfgpNode[],
  input: BuildMachineNodeLayoutWidthsInput,
): number {
  let max = MACHINE_NODE_MIN_WIDTH;
  for (const node of nodesInGroup) {
    if (!isMachineNode(node) || node.machineId !== machineId) continue;
    max = Math.max(max, computeNaturalLayoutWidthForMachineNode(node, input));
  }
  return max;
}

/** Same width for every node sharing a machineId — max natural width in that group. */
export function buildMachineNodeLayoutWidths(
  input: BuildMachineNodeLayoutWidthsInput,
): Record<string, number> {
  const naturalByNode = new Map<string, number>();

  for (const node of input.nodes) {
    if (!isMachineNode(node)) continue;
    naturalByNode.set(node.id, computeNaturalLayoutWidthForMachineNode(node, input));
  }

  const byMachineId = new Map<string, number>();
  for (const node of input.nodes) {
    if (!isMachineNode(node)) continue;
    const natural = naturalByNode.get(node.id) ?? MACHINE_NODE_MIN_WIDTH;
    byMachineId.set(
      node.machineId,
      Math.max(byMachineId.get(node.machineId) ?? 0, natural),
    );
  }

  const result: Record<string, number> = {};
  for (const node of input.nodes) {
    if (!isMachineNode(node)) continue;
    result[node.id] = byMachineId.get(node.machineId) ?? MACHINE_NODE_MIN_WIDTH;
  }
  return result;
}

/** @internal test helper */
export function clearMachineNodeLayoutTextWidthCache(): void {
  textWidthCache.clear();
}
