import { memo, useMemo, useState, type MouseEvent as ReactMouseEvent, type WheelEvent as ReactWheelEvent } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { useTranslation } from 'react-i18next';
import type { PackData, Flow } from '@/data/types';
import { getMachineName, getMachineRecipeCount, getRecipesForMachine } from '@/data/pack-registry';
import { formatRecipeLabel } from '@/lib/recipe-label';
import { RecipePicker } from './RecipePicker';
import { flowLabel, inputPortId, outputPortId, productKey } from './ports';
import { adjustByWheel } from '@/lib/wheel-adjust';
import type { Rational } from '@/calculator/rational';
import { R } from '@/calculator/rational';
import { formatFlowRateLabel, isChancedFlow } from '@/lib/flow-chance';
export interface PortDisplay {
  portId: string;
  label: string;
  tooltip?: string;
  rate?: string;
  connected: boolean;
}

export interface MachineNodeData {
  machineId: string;
  recipeId: string;
  machineCount: number;
  overclock: number;
  parallel: number;
  pack: PackData;
  onRecipeChange: (recipeId: string) => void;
  onMachineCountChange: (count: number) => void;
  onOverclockChange: (overclock: number) => void;
  onPortContextMenu: (
    portId: string,
    side: 'in' | 'out',
    clientX: number,
    clientY: number,
  ) => void;
  inputPorts: PortDisplay[];
  outputPorts: PortDisplay[];
  surplusLines: string[];
  [key: string]: unknown;
}


function formatOverclock(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
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
    </div>
  );
}

function MachineNodeComponent({ data, dragging, selected }: NodeProps) {
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
  const useStaticRecipeDuringDrag = dragging && hasRecipePicker;

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
        </div>
        {recipe?.energy && (
          <div className="meta">{recipe.energy.euPerTick} EU/t</div>
        )}
        {d.surplusLines.map((line) => (
          <div key={line} className="machine-node__surplus" title={line}>
            {line}
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
      return {
        portId,
        label,
        tooltip: rate ? `${label} · ${rate}` : label,
        rate,
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
