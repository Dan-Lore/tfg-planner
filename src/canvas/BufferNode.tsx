import { memo, useLayoutEffect, useMemo, useRef, type MouseEvent as ReactMouseEvent } from 'react';
import { Handle, Position, useUpdateNodeInternals, type NodeProps } from '@xyflow/react';
import { useTranslation } from 'react-i18next';
import type { PackData } from '@/data/types';
import type { TfgpBufferKind, TfgpSupplyMode } from '@/schema/tfgp';
import { flowLabel } from '@/canvas/ports';
import { formatRate } from '@/calculator/flow-solver';
import { R } from '@/calculator/rational';
import { loadGradientStyle } from '@/lib/load-gradient';
import type { PortDisplay } from '@/canvas/MachineNode';
import { BUFFER_NODE_WIDTH } from '@/canvas/node-bounds';

export interface BufferNodeData {
  bufferKind: TfgpBufferKind;
  itemId?: string;
  fluidId?: string;
  capacity: number;
  supplyMode?: TfgpSupplyMode;
  supplyRate?: number;
  initialStock?: number;
  autoSupplyRate?: boolean;
  pack: PackData;
  inputPorts: PortDisplay[];
  outputPorts: PortDisplay[];
  loadPercent?: number;
  loadLabel?: string;
  loadTitle?: string;
  onCapacityChange: (value: number) => void;
  onSupplyModeChange: (mode: TfgpSupplyMode) => void;
  onSupplyRateChange: (value: number) => void;
  onInitialStockChange: (value: number) => void;
  onPortContextMenu: (
    portId: string,
    side: 'in' | 'out',
    clientX: number,
    clientY: number,
  ) => void;
  [key: string]: unknown;
}

function formatLoadPercentDisplay(percent: number): string {
  if (percent >= 99.95) return '100%';
  if (percent <= 0.05) return '0%';
  return `${Math.round(percent)}%`;
}

function BufferPortRow({
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
  const tooltip = port.tooltip ?? [port.label, port.rate].filter(Boolean).join(' · ');
  return (
    <div
      className={`buffer-port buffer-port--${side} ${port.connected ? 'buffer-port--connected' : 'buffer-port--open'}`}
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
        className={`buffer-port__handle ${port.connected ? '' : 'buffer-port__handle--open'}`}
      />
      {port.rate && (
        <span className="buffer-port__rate" title={tooltip}>
          {port.rate}
        </span>
      )}
      {port.loadLabel != null && (
        <span
          className="buffer-port__load"
          style={loadGradientStyle(port.loadPercent ?? 0)}
          title={port.tooltip ?? port.loadLabel}
        >
          {formatLoadPercentDisplay(port.loadPercent ?? 0)}
        </span>
      )}
    </div>
  );
}

function BufferNodeComponent({ id, data, selected, dragging }: NodeProps) {
  const updateNodeInternals = useUpdateNodeInternals();
  const rootRef = useRef<HTMLDivElement>(null);
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'en' ? 'en' : 'ru';
  const d = data as BufferNodeData;

  const productLabel = useMemo(() => {
    const id = d.itemId ?? d.fluidId;
    if (!id) return t('editor.buffer.unknownProduct');
    return flowLabel({ itemId: d.itemId, fluidId: d.fluidId, amount: 1 }, d.pack, lang);
  }, [d.itemId, d.fluidId, d.pack, lang, t]);

  const kindLabel = t(`editor.buffer.kind.${d.bufferKind}`);

  useLayoutEffect(() => {
    updateNodeInternals(id);
  }, [id, updateNodeInternals, d.bufferKind, d.capacity, d.supplyMode]);

  return (
    <div
      ref={rootRef}
      className={`buffer-node ${selected ? 'buffer-node--selected' : ''} ${dragging ? 'is-dragging' : ''}`}
      style={{ width: BUFFER_NODE_WIDTH, overflow: 'hidden' }}
    >
      <div className="buffer-node__header buffer-node__drag-handle">
        <div className="buffer-node__kind">{kindLabel}</div>
        <div className="buffer-node__product" title={productLabel}>
          {productLabel}
        </div>
        {d.loadLabel && (
          <span className="buffer-node__load-chip" title={d.loadTitle ?? d.loadLabel}>
            {d.loadLabel}
          </span>
        )}
      </div>
      <div className="buffer-node__fields nodrag nowheel">
        <label className="buffer-node__field">
          <span>{t('editor.buffer.capacity')}</span>
          <input
            type="number"
            min={0}
            step={1}
            value={d.capacity}
            onChange={(e) =>
              d.onCapacityChange(Math.max(0, Math.round(Number(e.target.value) || 0)))
            }
            onMouseDown={(e) => e.stopPropagation()}
          />
        </label>
        {d.bufferKind === 'start_buffer' && (
          <>
            <label className="buffer-node__field">
              <span>{t('editor.buffer.supplyMode')}</span>
              <select
                value={d.supplyMode ?? 'rate'}
                onChange={(e) =>
                  d.onSupplyModeChange(e.target.value as TfgpSupplyMode)
                }
                onMouseDown={(e) => e.stopPropagation()}
              >
                <option value="rate">{t('editor.buffer.supplyModeRate')}</option>
                <option value="stock">{t('editor.buffer.supplyModeStock')}</option>
              </select>
            </label>
            {d.supplyMode === 'stock' ? (
              <label className="buffer-node__field">
                <span>{t('editor.buffer.initialStock')}</span>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={d.initialStock ?? 0}
                  onChange={(e) =>
                    d.onInitialStockChange(
                      Math.max(0, Math.round(Number(e.target.value) || 0)),
                    )
                  }
                  onMouseDown={(e) => e.stopPropagation()}
                />
              </label>
            ) : (
              <label className="buffer-node__field">
                <span>{t('editor.buffer.supplyRate')}</span>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={d.supplyRate ?? 0}
                  onChange={(e) =>
                    d.onSupplyRateChange(
                      Math.max(0, Math.round(Number(e.target.value) || 0)),
                    )
                  }
                  onMouseDown={(e) => e.stopPropagation()}
                />
                {d.autoSupplyRate && (
                  <span className="buffer-node__hint">{t('editor.buffer.autoRate')}</span>
                )}
              </label>
            )}
          </>
        )}
      </div>
      <div className="buffer-node__ports">
        <div className="buffer-node__ports-col buffer-node__ports-col--in">
          {d.inputPorts.map((port) => (
            <BufferPortRow
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
        <div className="buffer-node__ports-col buffer-node__ports-col--out">
          {d.outputPorts.map((port) => (
            <BufferPortRow
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

export const BufferNode = memo(BufferNodeComponent);

export function buildBufferPortDisplays(
  bufferKind: TfgpBufferKind,
  pack: PackData,
  lang: 'ru' | 'en',
  itemId: string | undefined,
  fluidId: string | undefined,
  connectedIn: Set<string>,
  connectedOut: Set<string>,
  inRate?: string,
  outRate?: string,
  inLoadPercent?: number,
  outLoadPercent?: number,
): { inputPorts: PortDisplay[]; outputPorts: PortDisplay[] } {
  const label = flowLabel(
    { itemId, fluidId, amount: 1 },
    pack,
    lang,
  );
  const inputPorts: PortDisplay[] = [];
  const outputPorts: PortDisplay[] = [];

  if (bufferKind === 'intermediate_buffer' || bufferKind === 'end_buffer') {
    inputPorts.push({
      portId: 'in_0',
      label,
      rate: inRate,
      loadPercent: inLoadPercent,
      loadLabel: inLoadPercent != null ? formatLoadPercentDisplay(inLoadPercent) : undefined,
      connected: connectedIn.has('in_0'),
    });
  }
  if (bufferKind === 'start_buffer' || bufferKind === 'intermediate_buffer') {
    outputPorts.push({
      portId: 'out_0',
      label,
      rate: outRate,
      loadPercent: outLoadPercent,
      loadLabel: outLoadPercent != null ? formatLoadPercentDisplay(outLoadPercent) : undefined,
      connected: connectedOut.has('out_0'),
    });
  }

  return { inputPorts, outputPorts };
}

export function formatBufferRate(rational: ReturnType<typeof R.from> | undefined): string | undefined {
  if (!rational || rational.compare(R.zero) <= 0) return undefined;
  return `${formatRate(rational)}/s`;
}
