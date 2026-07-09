import { useTranslation } from 'react-i18next';
import type { FlowResult } from '@/calculator';
import { R } from '@/calculator';
import { buildBufferPortDisplays, formatBufferRate } from '@/canvas/BufferNode';
import { flowLabel } from '@/canvas/ports';
import type { PackLike } from '@/data/pack-registry';
import { loadGradientStyle } from '@/lib/load-gradient';
import { isBufferNode } from '@/shared/node-kind';
import type { TfgpEdge, TfgpNode, TfgpSupplyMode } from '@/schema/tfgp';
import type { SchemeCheckResult } from '@/scheme-check/check-scheme';
import { InspectorSection, NodeIssuesSection } from '@/editor/inspector/inspector-shared';
import { PortList } from '@/editor/inspector/PortList';

export function BufferInspector({
  node,
  pack,
  lang,
  flowResult,
  connectedIn,
  connectedOut,
  updateNode,
  schemeCheck,
  nodes,
  edges,
}: {
  node: TfgpNode;
  pack: PackLike;
  lang: 'ru' | 'en';
  flowResult: FlowResult | null;
  connectedIn: Set<string>;
  connectedOut: Set<string>;
  updateNode: (id: string, patch: Partial<TfgpNode>) => void;
  schemeCheck: SchemeCheckResult | null;
  nodes: TfgpNode[];
  edges: TfgpEdge[];
}) {
  const { t } = useTranslation();
  if (!isBufferNode(node)) return null;

  const productLabel = flowLabel(
    { itemId: node.itemId, fluidId: node.fluidId, amount: 1 },
    pack,
    lang,
  );

  const inRate = formatBufferRate(
    flowResult?.nodeInputRates[node.id]
      ? Object.values(flowResult.nodeInputRates[node.id]!)[0]
      : undefined,
  );
  const outRate = formatBufferRate(flowResult?.nodePortOutputRates[node.id]?.out_0);
  const inLoad = flowResult?.nodePortInLoad[node.id]?.in_0?.mul(R.from(100)).toNumber();
  const outLoad = flowResult?.nodePortOutLoad[node.id]?.out_0?.mul(R.from(100)).toNumber();
  const loadFraction = flowResult?.nodeLoad[node.id];
  const loadPercent = loadFraction
    ? Math.min(100, Math.max(0, loadFraction.mul(R.from(100)).toNumber()))
    : undefined;
  const nodeLoadMeta = loadPercent != null
    ? {
        loadPercent,
        label: t('editor.nodeLoadMeta', { value: `${Math.round(loadPercent)}%` }),
      }
    : undefined;

  const { inputPorts, outputPorts } = buildBufferPortDisplays(
    node.kind,
    pack,
    lang,
    node.itemId,
    node.fluidId,
    connectedIn,
    connectedOut,
    inRate,
    outRate,
    inLoad,
    outLoad,
  );

  return (
    <div className="editor-inspector">
      <p className="editor-inspector__title">
        <strong>{t(`editor.buffer.kind.${node.kind}`)}</strong>
      </p>

      <NodeIssuesSection
        nodeId={node.id}
        schemeCheck={schemeCheck}
        pack={pack}
        lang={lang}
        nodes={nodes}
        edges={edges}
      />

      <InspectorSection title={t('editor.inspector.settings')}>
        <label>{t('editor.inspector.product')}</label>
        <p className="editor-inspector__readonly">{productLabel}</p>

        <label htmlFor={`${node.id}-capacity`}>{t('editor.buffer.capacity')}</label>
        <input
          id={`${node.id}-capacity`}
          name={`${node.id}-capacity`}
          type="number"
          min={0}
          step={1}
          value={node.capacity}
          onChange={(e) =>
            updateNode(node.id, {
              capacity: Math.max(0, Math.round(Number(e.target.value) || 0)),
            })
          }
        />

        {node.kind === 'start_buffer' && (
          <>
            <label htmlFor={`${node.id}-supply-mode`}>{t('editor.buffer.supplyMode')}</label>
            <select
              id={`${node.id}-supply-mode`}
              name={`${node.id}-supply-mode`}
              value={node.supplyMode ?? 'rate'}
              onChange={(e) =>
                updateNode(node.id, { supplyMode: e.target.value as TfgpSupplyMode })
              }
            >
              <option value="rate">{t('editor.buffer.supplyModeRate')}</option>
              <option value="stock">{t('editor.buffer.supplyModeStock')}</option>
            </select>

            {node.supplyMode === 'stock' ? (
              <>
                <label htmlFor={`${node.id}-initial-stock`}>
                  {t('editor.buffer.initialStock')}
                </label>
                <input
                  id={`${node.id}-initial-stock`}
                  name={`${node.id}-initial-stock`}
                  type="number"
                  min={0}
                  step={1}
                  value={node.initialStock ?? 0}
                  onChange={(e) =>
                    updateNode(node.id, {
                      initialStock: Math.max(0, Math.round(Number(e.target.value) || 0)),
                    })
                  }
                />
              </>
            ) : (
              <>
                <label htmlFor={`${node.id}-supply-rate`}>{t('editor.buffer.supplyRate')}</label>
                <input
                  id={`${node.id}-supply-rate`}
                  name={`${node.id}-supply-rate`}
                  type="number"
                  min={0}
                  step={1}
                  value={node.supplyRate ?? 0}
                  onChange={(e) =>
                    updateNode(node.id, {
                      supplyRate: Math.max(0, Math.round(Number(e.target.value) || 0)),
                    })
                  }
                />
                {node.autoSupplyRate && (
                  <p className="editor-inspector__hint">{t('editor.buffer.autoRate')}</p>
                )}
              </>
            )}
          </>
        )}
      </InspectorSection>

      {(nodeLoadMeta || inputPorts.length > 0 || outputPorts.length > 0) && (
        <InspectorSection title={t('editor.inspector.calculation')}>
          {nodeLoadMeta && (
            <div
              className="editor-inspector__load-chip"
              style={loadGradientStyle(nodeLoadMeta.loadPercent)}
            >
              {nodeLoadMeta.label}
            </div>
          )}
          {(inputPorts.length > 0 || outputPorts.length > 0) && (
            <>
              <h5 className="editor-inspector__subsection">{t('editor.inspector.ports')}</h5>
              <PortList ports={inputPorts} direction="in" t={t} />
              <PortList ports={outputPorts} direction="out" t={t} />
            </>
          )}
        </InspectorSection>
      )}
    </div>
  );
}
