import type { TFunction } from 'i18next';
import type { FlowResult } from '@/calculator/flow-solver';
import {
  allowedTiersForRecipe,
  effectiveDurationTicks,
  effectiveEuPerTick,
  effectiveTotalEu,
  formatEuPerTick,
} from '@/calculator/energy';
import type { VoltageTier } from '@/calculator/gt-voltage';
import { buildPortDisplays, type MachineNodeData, type PortDisplay } from '@/canvas/MachineNode';
import { buildNodeBalanceLines, buildInputPortLoadMeta, buildOutputPortLoadMeta, rateMapToStrings } from '@/canvas/flow-display';
import { MACHINE_NODE_MIN_WIDTH } from '@/canvas/node-bounds';
import { getMachineName, getMachineRecipeCount } from '@/data/pack-registry';
import type { PackData } from '@/data/types';
import { formatRecipeLabel } from '@/lib/recipe-label';
import { formatRecipeDuration } from '@/lib/recipe-duration';
import type { TfgpEdge, TfgpNode } from '@/schema/tfgp';
import { isMachineNode } from '@/lib/node-kind';

export function buildConnectedPortMaps(edges: TfgpEdge[]): {
  connectedIn: Map<string, Set<string>>;
  connectedOut: Map<string, Set<string>>;
} {
  const connectedIn = new Map<string, Set<string>>();
  const connectedOut = new Map<string, Set<string>>();
  for (const edge of edges) {
    if (!connectedOut.has(edge.source)) connectedOut.set(edge.source, new Set());
    if (!connectedIn.has(edge.target)) connectedIn.set(edge.target, new Set());
    connectedOut.get(edge.source)!.add(edge.sourcePort);
    connectedIn.get(edge.target)!.add(edge.targetPort);
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

function formatLoadPercentDisplay(percent: number): string {
  if (percent >= 99.95) return '100%';
  if (percent <= 0.05) return '0%';
  return `${Math.round(percent)}%`;
}

/** Estimate rendered width from node display data (matches `.machine-node` layout). */
export function estimateMachineNodeLayoutWidth(
  data: MachineNodeData,
  lang: 'ru' | 'en' = 'ru',
): number {
  const title = getMachineName(data.pack, data.machineId, lang);
  const recipe = data.pack.recipes.find((r) => r.id === data.recipeId);
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
  for (const line of data.balanceLines) {
    metaW = Math.max(metaW, measureTextWidth(line.text, 0.65, 600) + HEADER_PAD_X);
  }

  const inCol = portColumnWidth(data.inputPorts);
  const outCol = portColumnWidth(data.outputPorts);
  const portsW = inCol + PORTS_COL_GAP + outCol + HEADER_PAD_X;

  return Math.ceil(
    Math.max(MACHINE_NODE_MIN_WIDTH, titleW, recipeW, metaW, portsW),
  );
}

export interface BuildMachineNodeLayoutWidthsInput {
  nodes: TfgpNode[];
  pack: PackData;
  lang: 'ru' | 'en';
  flowResult?: FlowResult;
  connectedIn: Map<string, Set<string>>;
  connectedOut: Map<string, Set<string>>;
  t: TFunction;
}

/** Same width for every node sharing a machineId — max natural width in that group. */
export function buildMachineNodeLayoutWidths(
  input: BuildMachineNodeLayoutWidthsInput,
): Record<string, number> {
  const naturalByNode = new Map<string, number>();

  for (const node of input.nodes) {
    if (!isMachineNode(node)) continue;
    const recipe = input.pack.recipes.find((r) => r.id === node.recipeId);
    const inputRates = rateMapToStrings(input.flowResult?.nodeInputRates[node.id]);
    const outputRates = rateMapToStrings(input.flowResult?.nodeOutputRates[node.id]);
    const outputPortRateRationals = input.flowResult?.nodePortOutputRates[node.id];
    const connectedIn = input.connectedIn.get(node.id) ?? new Set();
    const connectedOut = input.connectedOut.get(node.id) ?? new Set();
    const inputPortLoadMeta = input.flowResult
      ? buildInputPortLoadMeta(
          node.id,
          recipe,
          connectedIn,
          input.flowResult,
          input.t,
        )
      : undefined;
    const outputPortLoadMeta = input.flowResult
      ? buildOutputPortLoadMeta(
          node.id,
          recipe,
          connectedOut,
          input.flowResult,
          input.t,
        )
      : undefined;
    const { inputPorts, outputPorts } = buildPortDisplays(
      recipe,
      input.pack,
      input.lang,
      connectedIn,
      connectedOut,
      inputRates,
      outputRates,
      outputPortRateRationals,
      inputPortLoadMeta,
      outputPortLoadMeta,
    );
    const balanceLines = input.flowResult
      ? buildNodeBalanceLines(
          node.id,
          recipe,
          input.connectedIn.get(node.id) ?? new Set(),
          input.flowResult,
          input.pack,
          input.lang,
        )
      : [];

    const stubData: MachineNodeData = {
      machineId: node.machineId,
      recipeId: node.recipeId,
      machineCount: node.machineCount,
      overclock: node.overclock,
      parallel: node.parallel,
      voltageTier: node.voltageTier as VoltageTier,
      pack: input.pack,
      onRecipeChange: () => {},
      onMachineCountChange: () => {},
      onOverclockChange: () => {},
      onVoltageTierChange: () => {},
      onPortContextMenu: () => {},
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
        metaParts.push(
          input.t('editor.tierMeta', { value: node.voltageTier }),
        );
      }
      const ticks = effectiveDurationTicks(
        recipe,
        node.voltageTier as VoltageTier,
        node.overclock,
      );
      const duration = formatRecipeDuration(ticks, input.lang);
      if (duration) metaParts.push(duration);

      const metaW =
        measureTextWidth(metaParts.join(' · '), 0.7) + HEADER_PAD_X;
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
        width = Math.max(
          width,
          measureTextWidth(energyLine, 0.7) + HEADER_PAD_X,
        );
      }
    }

    naturalByNode.set(node.id, width);
  }

  const byMachineId = new Map<string, number>();
  for (const node of input.nodes) {
    const natural = naturalByNode.get(node.id) ?? MACHINE_NODE_MIN_WIDTH;
    byMachineId.set(
      node.machineId,
      Math.max(byMachineId.get(node.machineId) ?? 0, natural),
    );
  }

  const result: Record<string, number> = {};
  for (const node of input.nodes) {
    result[node.id] = byMachineId.get(node.machineId) ?? MACHINE_NODE_MIN_WIDTH;
  }
  return result;
}

/** @internal test helper */
export function clearMachineNodeLayoutTextWidthCache(): void {
  textWidthCache.clear();
}
