import { memo, type MouseEvent as ReactMouseEvent } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { useTranslation } from 'react-i18next';
import type { PackLike } from '@/data/pack-registry';
import type { TfgpCustomPort } from '@/schema/tfgp';
import type { NodeBalanceLine } from '@/canvas/flow-display';
import { formatRecipeDuration } from '@/lib/recipe-duration';
import { loadGradientStyle } from '@/lib/load-gradient';
import {
  CUSTOM_MACHINE_NODE_MIN_WIDTH,
  resolveMachineCardWidth,
} from '@/canvas/node-bounds';
import { useNodeDisplay } from '@/canvas/node-display-context';
import { useEditorNodeActions } from '@/canvas/editor-node-actions-context';
import { useNodeInternalsSync } from '@/canvas/use-node-internals-sync';
import { useMeasureNodeCard } from '@/canvas/node-card-measure-context';
import { useNodeSelected } from '@/canvas/selection-context';
import { resolvePortDisplays } from '@/canvas/resolve-port-displays';
import type { PortDisplay } from '@/canvas/MachineNode';

export interface CustomMachineNodeData {
  label?: string;
  durationTicks: number;
  machineCount: number;
  overclock: number;
  inputs: TfgpCustomPort[];
  outputs: TfgpCustomPort[];
  pack: PackLike;
  inputPorts?: PortDisplay[];
  outputPorts?: PortDisplay[];
  balanceLines?: NodeBalanceLine[];
  loadPercent?: number;
  loadLabel?: string;
  loadTitle?: string;
  inputPortIds?: string[];
  outputPortIds?: string[];
  checkSeverity?: 'error' | 'warning';
  checkTitle?: string;
  layoutWidth?: number;
  [key: string]: unknown;
}

function formatOverclock(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function CustomPortRow({
  port,
  amount,
  onContextMenu,
}: {
  port: PortDisplay;
  amount: number;
  onContextMenu: (portId: string, side: 'in' | 'out', e: ReactMouseEvent) => void;
}) {
  const { t } = useTranslation();
  const side = port.portId.startsWith('in_') ? 'in' : 'out';
  const type = side === 'in' ? 'target' : 'source';
  const label = port.label || t('editor.customMachine.emptyPort');
  return (
    <div
      className={`machine-port custom-machine-port machine-port--${side === 'in' ? 'left' : 'right'} ${port.connected ? 'machine-port--connected' : 'machine-port--open'}`}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onContextMenu(port.portId, side, e);
      }}
    >
      <Handle
        id={port.portId}
        type={type}
        position={side === 'in' ? Position.Left : Position.Right}
        className={`machine-port__handle ${port.connected ? '' : 'machine-port__handle--open'}`}
      />
      <div className="custom-machine-port__body">
        <span className="machine-port__label" title={port.tooltip ?? label}>
          {label}
        </span>
        <div className="custom-machine-port__controls">
          <span className="custom-machine-port__amount-static">×{amount}</span>
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
              {port.loadLabel}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function CustomMachineNodeComponent({ id, data, dragging, width }: NodeProps) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'en' ? 'en' : 'ru';
  const d = data as CustomMachineNodeData;
  const display = useNodeDisplay(id);
  const actions = useEditorNodeActions();
  const isSelected = useNodeSelected(id);

  const title = d.label?.trim() || t('editor.customMachine.title');
  const effectiveTicks = d.durationTicks / Math.max(d.overclock, 0.1);
  const durationLabel = formatRecipeDuration(Math.round(effectiveTicks), lang);

  const inputPorts = resolvePortDisplays(
    d.inputPortIds,
    display.inputPorts,
    d.inputPorts,
  );
  const outputPorts = resolvePortDisplays(
    d.outputPortIds,
    display.outputPorts,
    d.outputPorts,
  );

  const loadLabel = display.loadLabel ?? d.loadLabel;
  const loadTitle = display.loadTitle ?? d.loadTitle;
  const loadPercent = display.loadPercent ?? d.loadPercent;
  const bottleneckLabel = display.bottleneckLabel;
  const bottleneckTitle = display.bottleneckTitle;
  const balanceLines = display.balanceLines ?? d.balanceLines ?? [];

  const cardWidth = resolveMachineCardWidth(d.layoutWidth, width);
  const internalsKey = [
    d.durationTicks,
    d.machineCount,
    d.overclock,
    d.label ?? '',
    (d.inputPortIds ?? []).join(','),
    (d.outputPortIds ?? []).join(','),
    d.inputs.map((p) => `${p.label ?? ''}:${p.amount}`).join(','),
    d.outputs.map((p) => `${p.label ?? ''}:${p.amount}`).join(','),
  ].join('|');
  useNodeInternalsSync(id, internalsKey);
  const measureKey = `${internalsKey}|${loadLabel ?? ''}`;
  const cardMeasureRef = useMeasureNodeCard(id, measureKey);

  const portAmount = (side: 'in' | 'out', index: number): number => {
    const list = side === 'in' ? d.inputs : d.outputs;
    return list[index]?.amount ?? 1;
  };

  return (
    <div
      ref={cardMeasureRef}
      className={[
        'machine-node',
        'custom-machine-node',
        isSelected ? 'machine-node--selected' : '',
        d.checkSeverity ? `machine-node--issue-${d.checkSeverity}` : '',
        dragging ? 'is-dragging' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={{
        width: cardWidth,
        minWidth: Math.max(cardWidth, CUSTOM_MACHINE_NODE_MIN_WIDTH),
        boxSizing: 'border-box',
      }}
    >
      <div className="machine-node__drag-handle machine-node__header">
        <div className="title" title={title}>
          {title}
        </div>
        <div className="meta machine-node__meta-row">
          <span className="machine-node__meta-static">
            {t('editor.machinesMeta', { count: d.machineCount })}
          </span>
          <span className="machine-node__meta-sep" aria-hidden>
            ·
          </span>
          <span className="machine-node__meta-static">
            {t('editor.overclockMeta', { value: formatOverclock(d.overclock) })}
          </span>
          <span className="machine-node__meta-sep" aria-hidden>
            ·
          </span>
          <span
            className="machine-node__meta-static machine-node__meta-duration"
            title={t('editor.inspector.durationTicks')}
          >
            {d.durationTicks}t → {durationLabel}
          </span>
        </div>
        {loadLabel != null && (
          <div
            className="machine-node__load"
            style={loadGradientStyle(loadPercent ?? 0)}
            title={loadTitle}
          >
            {loadLabel}
          </div>
        )}
        {bottleneckLabel != null && (
          <div className="machine-node__bottleneck" title={bottleneckTitle}>
            {bottleneckLabel}
          </div>
        )}
        {balanceLines.map((line) => (
          <div
            key={line.text}
            className={`machine-node__balance machine-node__balance--${line.kind}`}
            title={line.text}
          >
            {line.text}
          </div>
        ))}
      </div>
      <div className="machine-node__ports custom-machine-node__ports">
        <div className="machine-node__ports-col machine-node__ports-col--in">
          <div className="custom-machine-node__col-label">{t('editor.inspector.portIn')}</div>
          {inputPorts.map((port) => {
            const index = Number.parseInt(port.portId.slice(3), 10);
            return (
              <CustomPortRow
                key={port.portId}
                port={port}
                amount={portAmount('in', index)}
                onContextMenu={(portId, side, e) =>
                  actions.onPortContextMenu(id, portId, side, e.clientX, e.clientY)
                }
              />
            );
          })}
        </div>
        <div className="machine-node__ports-col machine-node__ports-col--out">
          <div className="custom-machine-node__col-label custom-machine-node__col-label--out">
            {t('editor.inspector.portOut')}
          </div>
          {outputPorts.map((port) => {
            const index = Number.parseInt(port.portId.slice(3), 10);
            return (
              <CustomPortRow
                key={port.portId}
                port={port}
                amount={portAmount('out', index)}
                onContextMenu={(portId, side, e) =>
                  actions.onPortContextMenu(id, portId, side, e.clientX, e.clientY)
                }
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

export const CustomMachineNode = memo(CustomMachineNodeComponent);
