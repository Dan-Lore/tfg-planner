import { memo, useMemo, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { useTranslation } from 'react-i18next';
import type { PackData } from '@/data/types';
import { getMachineName, getRecipesForMachine } from '@/data/pack-registry';
import { RecipePicker } from './RecipePicker';
import { flowKey, flowLabel, inputPortId, outputPortId } from './ports';
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
  outputMultiplier: number;
  pack: PackData;
  onRecipeChange: (recipeId: string) => void;
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
  const { i18n } = useTranslation();
  const lang = i18n.language === 'en' ? 'en' : 'ru';
  const d = data as MachineNodeData;
  const [recipeMenuOpen, setRecipeMenuOpen] = useState(false);
  const recipe = d.pack.recipes.find((r) => r.id === d.recipeId);
  const title = getMachineName(d.pack, d.machineId, lang);
  const recipes = getRecipesForMachine(d.pack, d.machineId);
  const portCount = Math.max(d.inputPorts.length, d.outputPorts.length, 1);
  const bodyMinHeight = 48 + portCount * 28;

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
      style={{ minHeight: bodyMinHeight }}
    >
      <div className="machine-node__drag-handle machine-node__header">
        <div className="title" title={title}>
          {title}
        </div>
        {recipes.length > 1 && (
          <RecipePicker
            pack={d.pack}
            recipes={recipes}
            value={d.recipeId}
            lang={lang}
            dragging={dragging}
            onChange={d.onRecipeChange}
            onOpenChange={setRecipeMenuOpen}
          />
        )}
        <div className="meta">
          ×{d.machineCount} · OC {d.overclock} · P {d.parallel}
          {d.outputMultiplier !== 1 && ` · out×${d.outputMultiplier}`}
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
  recipe: { inputs: { itemId?: string; fluidId?: string; amount: number }[]; outputs: { itemId?: string; fluidId?: string; amount: number }[] } | undefined,
  pack: PackData,
  lang: 'ru' | 'en',
  connectedIn: Set<string>,
  connectedOut: Set<string>,
  inputRates: Record<string, string>,
  outputRates: Record<string, string>,
): { inputPorts: PortDisplay[]; outputPorts: PortDisplay[] } {
  if (!recipe) {
    return { inputPorts: [], outputPorts: [] };
  }
  return {
    inputPorts: recipe.inputs.map((flow, i) => {
      const portId = inputPortId(i);
      const key = flowKey(flow);
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
      const key = flowKey(flow);
      const label = flowLabel(flow, pack, lang, flow.amount);
      const rate = outputRates[key];
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
