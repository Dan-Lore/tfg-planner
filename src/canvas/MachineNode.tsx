import { memo, useLayoutEffect, useMemo, useState, type MouseEvent as ReactMouseEvent, type WheelEvent as ReactWheelEvent } from 'react';
import { Handle, Position, useUpdateNodeInternals, type NodeProps } from '@xyflow/react';
import { useTranslation } from 'react-i18next';
import type { PackData, Flow } from '@/data/types';
import { getMachineName, getMachineRecipeCount, getRecipesForMachine } from '@/data/pack-registry';
import type { NodeBalanceLine } from '@/canvas/flow-display';
import { formatRecipeLabel } from '@/lib/recipe-label';
import { formatRecipeDuration } from '@/lib/recipe-duration';
import type { VoltageTier } from '@/calculator/gt-voltage';
import {
  allowedTiersForRecipe,
  effectiveDurationTicks,
  effectiveEuPerTick,
  effectiveTotalEu,
  formatEuPerTick,
} from '@/calculator/energy';
import { RecipePicker } from './RecipePicker';
import { flowLabel, inputPortId, outputPortId, productKey } from './ports';
import { adjustByWheel } from '@/lib/wheel-adjust';
import type { Rational } from '@/calculator/rational';
import { R } from '@/calculator/rational';
import { formatFlowRateLabel, isChancedFlow } from '@/lib/flow-chance';
import { loadGradientStyle } from '@/lib/load-gradient';
export interface PortDisplay {
  portId: string;
  label: string;
  tooltip?: string;
  rate?: string;
  /** Input port load 0…100 for styling. */
  loadPercent?: number;
  loadLabel?: string;
  connected: boolean;
}

export interface MachineNodeData {
  machineId: string;
  recipeId: string;
  machineCount: number;
  overclock: number;
  parallel: number;
  voltageTier: VoltageTier;
  pack: PackData;
  onRecipeChange: (recipeId: string) => void;
  onMachineCountChange: (count: number) => void;
  onOverclockChange: (overclock: number) => void;
  onVoltageTierChange: (tier: VoltageTier) => void;
  onPortContextMenu: (
    portId: string,
    side: 'in' | 'out',
    clientX: number,
    clientY: number,
  ) => void;
  inputPorts: PortDisplay[];
  outputPorts: PortDisplay[];
  balanceLines: NodeBalanceLine[];
  /** Overall load 0…100. */
  loadPercent?: number;
  loadLabel?: string;
  loadTitle?: string;
  /** Unified width for all nodes of the same machineId. */
  layoutWidth?: number;
  [key: string]: unknown;
}


function formatOverclock(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function adjustVoltageTier(
  current: VoltageTier,
  allowed: VoltageTier[],
  deltaY: number,
): VoltageTier {
  if (allowed.length === 0) return current;
  const idx = allowed.indexOf(current);
  const base = idx >= 0 ? idx : 0;
  const step = deltaY > 0 ? -1 : 1;
  const next = Math.max(0, Math.min(allowed.length - 1, base + step));
  return allowed[next] ?? current;
}

function formatTotalEu(value: number): string {
  if (value >= 1000) return `${Math.round(value)} EU`;
  if (Number.isInteger(value)) return `${value} EU`;
  return `${Math.round(value * 10) / 10} EU`;
}

function MetaWheelChip({
  label,
  onWheel,
}: {
  label: string;
  onWheel: (e: ReactWheelEvent) => void;
}) {
  return (
    <span
      className="machine-node__meta-chip nodrag nowheel"
      onWheel={onWheel}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {label}
    </span>
  );
}

function PortRow({
  port,
  type,
  side,
  onContextMenu,
}: {
  port: PortDisplay;
  type: 'source' | 'target';
  side: 'left' | 'right';
  onContextMenu: (portId: string, side: 'in' | 'out', e: ReactMouseEvent) => void;
}) {
  const portSide = side === 'left' ? 'in' : 'out';
  return (
    <div
      className={`machine-port machine-port--${side} ${port.connected ? 'machine-port--connected' : 'machine-port--open'}`}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onContextMenu(port.portId, portSide, e);
      }}
    >
      <Handle
        id={port.portId}
        type={type}
        position={side === 'left' ? Position.Left : Position.Right}
        className={`machine-port__handle ${port.connected ? '' : 'machine-port__handle--open'}`}
      />
      <span className="machine-port__label" title={port.tooltip ?? port.label}>
        {port.label}
      </span>
      {port.rate && (
        <span className="machine-port__rate" title={port.tooltip ?? port.label}>
          {port.rate}
        </span>
      )}
      {port.loadLabel != null && (
        <span
          className="machine-port__load"
          style={loadGradientStyle(port.loadPercent ?? 0)}
          title={port.tooltip ?? port.loadLabel}
        >
          {formatLoadPercentDisplay(port.loadPercent ?? 0)}
        </span>
      )}
    </div>
  );
}

function formatLoadPercentDisplay(percent: number): string {
  if (percent >= 99.95) return '100%';
  if (percent <= 0.05) return '0%';
  return `${Math.round(percent)}%`;
}

function MachineNodeComponent({ id, data, dragging, selected }: NodeProps) {
  const updateNodeInternals = useUpdateNodeInternals();
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'en' ? 'en' : 'ru';
  const d = data as MachineNodeData;
  const [recipeMenuOpen, setRecipeMenuOpen] = useState(false);
  const recipeCount = getMachineRecipeCount(d.pack, d.machineId);
  const hasRecipePicker = recipeCount > 1;
  const recipe = d.pack.recipes.find((r) => r.id === d.recipeId);
  const title = getMachineName(d.pack, d.machineId, lang);
  const recipeLabel = useMemo(
    () => (recipe ? formatRecipeLabel(d.pack, recipe, lang) : ''),
    [d.pack, recipe, lang],
  );
  const recipeDuration = useMemo(() => {
    if (!recipe) return '';
    const ticks = effectiveDurationTicks(recipe, d.voltageTier, d.overclock);
    return formatRecipeDuration(ticks, lang);
  }, [recipe, d.voltageTier, d.overclock, lang]);
  const allowedTiers = useMemo(
    () => (recipe ? allowedTiersForRecipe(recipe) : []),
    [recipe],
  );
  const euPerTick = useMemo(() => {
    if (!recipe) return undefined;
    return effectiveEuPerTick(recipe, d.voltageTier);
  }, [recipe, d.voltageTier]);
  const totalEu = useMemo(() => {
    if (!recipe) return undefined;
    return effectiveTotalEu(recipe, d.voltageTier, d.overclock);
  }, [recipe, d.voltageTier, d.overclock]);
  const useStaticRecipeDuringDrag = dragging && hasRecipePicker;

  useLayoutEffect(() => {
    updateNodeInternals(id);
  }, [
    id,
    d.layoutWidth,
    d.inputPorts.length,
    d.outputPorts.length,
    d.balanceLines.length,
    d.loadLabel,
    d.recipeId,
    updateNodeInternals,
  ]);

  return (
    <div
      className={[
        'machine-node',
        selected ? 'selected' : '',
        recipeMenuOpen ? 'machine-node--menu-open' : '',
        dragging ? 'is-dragging' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={
        d.layoutWidth != null
          ? {
              width: d.layoutWidth,
              minWidth: d.layoutWidth,
              boxSizing: 'border-box',
            }
          : undefined
      }
    >
      <div className="machine-node__drag-handle machine-node__header">
        <div className="title" title={title}>
          {title}
        </div>
        {hasRecipePicker && !dragging && (
          <RecipePicker
            pack={d.pack}
            recipes={getRecipesForMachine(d.pack, d.machineId)}
            value={d.recipeId}
            lang={lang}
            dragging={dragging}
            onChange={d.onRecipeChange}
            onOpenChange={setRecipeMenuOpen}
          />
        )}
        {useStaticRecipeDuringDrag && (
          <div className="recipe-picker nodrag" title={recipeLabel}>
            <div className="recipe-picker__trigger recipe-picker__trigger--static">
              <span className="recipe-picker__label">{recipeLabel}</span>
            </div>
          </div>
        )}
        <div
          className="meta machine-node__meta-row nodrag nowheel"
          onWheel={(e) => e.stopPropagation()}
        >
          <MetaWheelChip
            label={t('editor.machinesMeta', { count: d.machineCount })}
            onWheel={(e) => {
              e.preventDefault();
              e.stopPropagation();
              d.onMachineCountChange(
                adjustByWheel(d.machineCount, e.deltaY, 1, 1),
              );
            }}
          />
          <span className="machine-node__meta-sep" aria-hidden>
            ·
          </span>
          <MetaWheelChip
            label={t('editor.overclockMeta', {
              value: formatOverclock(d.overclock),
            })}
            onWheel={(e) => {
              e.preventDefault();
              e.stopPropagation();
              d.onOverclockChange(
                adjustByWheel(d.overclock, e.deltaY, 0.1, 0.1),
              );
            }}
          />
          {allowedTiers.length > 0 && (
            <>
              <span className="machine-node__meta-sep" aria-hidden>
                ·
              </span>
              <MetaWheelChip
                label={t('editor.tierMeta', { value: d.voltageTier })}
                onWheel={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  d.onVoltageTierChange(
                    adjustVoltageTier(d.voltageTier, allowedTiers, e.deltaY),
                  );
                }}
              />
            </>
          )}
          {recipeDuration && (
            <>
              <span className="machine-node__meta-sep" aria-hidden>
                ·
              </span>
              <span className="machine-node__meta-static machine-node__duration">
                {recipeDuration}
              </span>
            </>
          )}
        </div>
        {euPerTick != null && (
          <div className="meta">
            {t('editor.energyMeta', { value: formatEuPerTick(euPerTick) })}
            {totalEu != null && (
              <>
                {' · '}
                {t('editor.totalEuMeta', { value: formatTotalEu(totalEu) })}
              </>
            )}
          </div>
        )}
        {d.loadLabel != null && (
          <div
            className="machine-node__load"
            style={loadGradientStyle(d.loadPercent ?? 0)}
            title={d.loadTitle}
          >
            {d.loadLabel}
          </div>
        )}
        {d.balanceLines.map((line) => (
          <div
            key={line.text}
            className={`machine-node__balance machine-node__balance--${line.kind}`}
            title={line.text}
          >
            {line.text}
          </div>
        ))}
      </div>
      <div className="machine-node__ports">
        <div className="machine-node__ports-col machine-node__ports-col--in">
          {d.inputPorts.map((port) => (
            <PortRow
              key={port.portId}
              port={port}
              type="target"
              side="left"
              onContextMenu={(portId, side, e) =>
                d.onPortContextMenu(portId, side, e.clientX, e.clientY)
              }
            />
          ))}
        </div>
        <div className="machine-node__ports-col machine-node__ports-col--out">
          {d.outputPorts.map((port) => (
            <PortRow
              key={port.portId}
              port={port}
              type="source"
              side="right"
              onContextMenu={(portId, side, e) =>
                d.onPortContextMenu(portId, side, e.clientX, e.clientY)
              }
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export const MachineNode = memo(MachineNodeComponent);

export function useNodeTypes() {
  return useMemo(() => ({ machine: MachineNode }), []);
}

export function buildPortDisplays(
  recipe:
    | {
        inputs: Flow[];
        outputs: Flow[];
      }
    | undefined,
  pack: PackData,
  lang: 'ru' | 'en',
  connectedIn: Set<string>,
  connectedOut: Set<string>,
  inputRates: Record<string, string>,
  outputRates: Record<string, string>,
  outputPortRateRationals?: Record<string, Rational>,
  inputPortLoadMeta?: Record<string, { loadPercent: number; title: string }>,
): { inputPorts: PortDisplay[]; outputPorts: PortDisplay[] } {
  if (!recipe) {
    return { inputPorts: [], outputPorts: [] };
  }
  return {
    inputPorts: recipe.inputs.map((flow, i) => {
      const portId = inputPortId(i);
      const key = productKey(flow);
      const label = flowLabel(flow, pack, lang, flow.amount);
      const rate = inputRates[key];
      const loadMeta = inputPortLoadMeta?.[portId];
      return {
        portId,
        label,
        tooltip: [rate ? `${label} · ${rate}` : label, loadMeta?.title]
          .filter(Boolean)
          .join('\n'),
        rate,
        loadPercent: loadMeta?.loadPercent,
        loadLabel: loadMeta
          ? formatLoadPercentDisplay(loadMeta.loadPercent)
          : undefined,
        connected: connectedIn.has(portId),
      };
    }),
    outputPorts: recipe.outputs.map((flow, i) => {
      const portId = outputPortId(i);
      const key = productKey(flow);
      const label = flowLabel(flow, pack, lang, flow.amount);
      const portRate = outputPortRateRationals?.[portId];
      const rate =
        portRate && portRate.compare(R.zero) > 0
          ? formatFlowRateLabel(portRate, isChancedFlow(flow))
          : outputRates[key];
      return {
        portId,
        label,
        tooltip: rate ? `${label} · ${rate}` : label,
        rate,
        connected: connectedOut.has(portId),
      };
    }),
  };
}
