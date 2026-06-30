import { memo, useMemo, type MouseEvent as ReactMouseEvent } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { useTranslation } from 'react-i18next';
import type { PackLike } from '@/data/pack-registry';
import type { TfgpBufferKind, TfgpSupplyMode } from '@/schema/tfgp';
import { flowLabel } from '@/canvas/ports';
import { formatRate } from '@/calculator/flow-solver';
import { R } from '@/calculator/rational';
import { loadGradientStyle } from '@/lib/load-gradient';
import type { PortDisplay } from '@/canvas/MachineNode';
import { BUFFER_NODE_WIDTH } from '@/canvas/node-bounds';
import { useNodeDisplay } from '@/canvas/node-display-context';
import { useEditorNodeActions } from '@/canvas/editor-node-actions-context';
import { useNodeInternalsSync } from '@/canvas/use-node-internals-sync';
import { resolvePortDisplays } from '@/canvas/resolve-port-displays';

export interface BufferNodeData {
  bufferKind: TfgpBufferKind;
  itemId?: string;
  fluidId?: string;
  capacity: number;
  supplyMode?: TfgpSupplyMode;
  supplyRate?: number;
  initialStock?: number;
  autoSupplyRate?: boolean;
  pack: PackLike;
  checkSeverity?: 'error' | 'warning';
  checkTitle?: string;
  inputPorts: PortDisplay[];
  outputPorts: PortDisplay[];
  loadPercent?: number;
  loadLabel?: string;
  loadTitle?: string;
  inputPortIds?: string[];
  outputPortIds?: string[];
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
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'en' ? 'en' : 'ru';
  const d = data as BufferNodeData;
  const display = useNodeDisplay(id);
  const actions = useEditorNodeActions();

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

  const internalsKey = `${d.bufferKind}|${d.capacity}|${d.supplyMode ?? ''}|${(d.inputPortIds ?? []).join(',')}|${(d.outputPortIds ?? []).join(',')}`;
  useNodeInternalsSync(id, internalsKey);

  const productLabel = useMemo(() => {
    const productId = d.itemId ?? d.fluidId;
    if (!productId) return t('editor.buffer.unknownProduct');
    return flowLabel({ itemId: d.itemId, fluidId: d.fluidId, amount: 1 }, d.pack, lang);
  }, [d.itemId, d.fluidId, d.pack, lang, t]);

  const kindLabel = t(`editor.buffer.kind.${d.bufferKind}`);

  return (
    <div
      className={[
        'buffer-node',
        selected ? 'buffer-node--selected' : '',
        d.checkSeverity ? `buffer-node--issue-${d.checkSeverity}` : '',
        dragging ? 'is-dragging' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      title={d.checkTitle}
      style={{ width: BUFFER_NODE_WIDTH, overflow: 'hidden' }}
    >
      <div className="buffer-node__header buffer-node__drag-handle">
        <div className="buffer-node__kind">{kindLabel}</div>
        <div className="buffer-node__product" title={productLabel}>
          {productLabel}
        </div>
        {loadLabel && (
          <span className="buffer-node__load-chip" title={loadTitle ?? loadLabel}>
            {loadLabel}
          </span>
        )}
      </div>
      <div className="buffer-node__fields nodrag nowheel">
        <label className="buffer-node__field" htmlFor={`${id}-capacity`}>
          <span>{t('editor.buffer.capacity')}</span>
          <input
            id={`${id}-capacity`}
            name={`${id}-capacity`}
            type="number"
            min={0}
            step={1}
            value={d.capacity}
            onChange={(e) =>
              actions.onCapacityChange(id, Math.max(0, Math.round(Number(e.target.value) || 0)))
            }
            onMouseDown={(e) => e.stopPropagation()}
          />
        </label>
        {d.bufferKind === 'start_buffer' && (
          <>
            <label className="buffer-node__field" htmlFor={`${id}-supply-mode`}>
              <span>{t('editor.buffer.supplyMode')}</span>
              <select
                id={`${id}-supply-mode`}
                name={`${id}-supply-mode`}
                value={d.supplyMode ?? 'rate'}
                onChange={(e) =>
                  actions.onSupplyModeChange(id, e.target.value as TfgpSupplyMode)
                }
                onMouseDown={(e) => e.stopPropagation()}
              >
                <option value="rate">{t('editor.buffer.supplyModeRate')}</option>
                <option value="stock">{t('editor.buffer.supplyModeStock')}</option>
              </select>
            </label>
            {d.supplyMode === 'stock' ? (
              <label className="buffer-node__field" htmlFor={`${id}-initial-stock`}>
                <span>{t('editor.buffer.initialStock')}</span>
                <input
                  id={`${id}-initial-stock`}
                  name={`${id}-initial-stock`}
                  type="number"
                  min={0}
                  step={1}
                  value={d.initialStock ?? 0}
                  onChange={(e) =>
                    actions.onInitialStockChange(
                      id,
                      Math.max(0, Math.round(Number(e.target.value) || 0)),
                    )
                  }
                  onMouseDown={(e) => e.stopPropagation()}
                />
              </label>
            ) : (
              <label className="buffer-node__field" htmlFor={`${id}-supply-rate`}>
                <span>{t('editor.buffer.supplyRate')}</span>
                <input
                  id={`${id}-supply-rate`}
                  name={`${id}-supply-rate`}
                  type="number"
                  min={0}
                  step={1}
                  value={d.supplyRate ?? 0}
                  onChange={(e) =>
                    actions.onSupplyRateChange(
                      id,
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
          {inputPorts.map((port) => (
            <BufferPortRow
              key={port.portId}
              port={port}
              type="target"
              side="left"
              onContextMenu={(portId, side, e) =>
                actions.onPortContextMenu(id, portId, side, e.clientX, e.clientY)
              }
            />
          ))}
        </div>
        <div className="buffer-node__ports-col buffer-node__ports-col--out">
          {outputPorts.map((port) => (
            <BufferPortRow
              key={port.portId}
              port={port}
              type="source"
              side="right"
              onContextMenu={(portId, side, e) =>
                actions.onPortContextMenu(id, portId, side, e.clientX, e.clientY)
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
  pack: PackLike,
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
