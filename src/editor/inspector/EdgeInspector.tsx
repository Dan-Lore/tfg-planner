import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { FlowResult } from '@/calculator';
import { flowLabel } from '@/canvas/ports';
import { getItemName } from '@/data/pack-registry';
import type { PackLike } from '@/data/pack-registry';
import type { FlowEdgeData } from '@/editor-graph/flow-edge-types';
import { parsePositiveRate } from '@/lib/parse-positive-rate';
import { buildCycleSeedInspectorLines } from '@/editor-graph/cycle-seed-label';
import type { TfgpEdge, TfgpEdgeConstraint, TfgpNode } from '@/schema/tfgp';
import type { EditorActions } from '@/editor/editor-actions';
import { getNodeDisplayName, InspectorSection } from '@/editor/inspector/inspector-shared';

export function EdgeInspector({
  edge,
  nodes,
  pack,
  lang,
  flowResult,
  flowEdgeData,
  edgeConstraints,
  setEdgeConstraint,
  clearEdgeConstraint,
}: {
  edge: TfgpEdge;
  nodes: TfgpNode[];
  pack: PackLike;
  lang: 'ru' | 'en';
  flowResult: FlowResult | null;
  flowEdgeData: Record<string, FlowEdgeData>;
  edgeConstraints: TfgpEdgeConstraint[];
  setEdgeConstraint: EditorActions['setEdgeConstraint'];
  clearEdgeConstraint: EditorActions['clearEdgeConstraint'];
}) {
  const { t } = useTranslation();
  const [rateInput, setRateInput] = useState('');
  const sourceNode = nodes.find((n) => n.id === edge.source);
  const targetNode = nodes.find((n) => n.id === edge.target);
  const edgeData = flowEdgeData[edge.id];
  const cycleSeed = flowResult?.cycleSeeds?.find((s) => s.edgeId === edge.id);
  const cycleSeedProductLabel = cycleSeed
    ? getItemName(pack, cycleSeed.productId, lang)
    : '';
  const cycleInspectorLines = cycleSeed
    ? buildCycleSeedInspectorLines(t, cycleSeed, cycleSeedProductLabel)
    : [];
  const currentConstraint = edgeConstraints.find((c) => c.edgeId === edge.id);
  const productLabel = flowLabel(
    { itemId: edge.itemId, fluidId: edge.fluidId, amount: 1 },
    pack,
    lang,
  );

  return (
    <div className="editor-inspector">
      <p className="editor-inspector__title">
        <strong>{t('editor.inspector.edgeTitle')}</strong>
      </p>

      <InspectorSection title={t('editor.inspector.product')}>
        <p className="editor-inspector__readonly">{productLabel}</p>
      </InspectorSection>

      <InspectorSection title={t('editor.inspector.settings')}>
        <p className="editor-inspector__meta">
          {t('editor.inspector.source')}:{' '}
          <strong>{sourceNode ? getNodeDisplayName(sourceNode, pack, lang) : edge.source}</strong>
          <br />
          {t('editor.inspector.port')}: {edge.sourcePort}
        </p>
        <p className="editor-inspector__meta">
          {t('editor.inspector.target')}:{' '}
          <strong>{targetNode ? getNodeDisplayName(targetNode, pack, lang) : edge.target}</strong>
          <br />
          {t('editor.inspector.port')}: {edge.targetPort}
        </p>
      </InspectorSection>

      <InspectorSection title={t('editor.inspector.calculation')}>
        {cycleInspectorLines.length > 0 ? (
          <div className="editor-inspector__cycle-info">
            {cycleInspectorLines.map((line) => (
              <p
                key={line.key}
                className="editor-inspector__meta editor-inspector__cycle-line"
                title={line.title}
              >
                {line.text}
              </p>
            ))}
          </div>
        ) : null}
        {!cycleSeed && edgeData?.source ? (
          <p className="editor-inspector__meta">
            {t('editor.inspector.flowSource')}: <strong>{edgeData.source}</strong>
          </p>
        ) : null}
        {!cycleSeed && edgeData?.target ? (
          <p className="editor-inspector__meta">
            {t('editor.inspector.flowTarget')}: <strong>{edgeData.target}</strong>
          </p>
        ) : null}
        {!cycleSeed && !edgeData?.source && !edgeData?.target && (
          <p className="editor-inspector__hint">{t('editor.inspector.noFlow')}</p>
        )}
        <div className="editor-inspector__field">
          <label htmlFor={`edge-rate-${edge.id}`}>{t('editor.edgeConstraint.rate')}</label>
          {currentConstraint && (
            <p className="editor-inspector__meta">
              {t('editor.edgeConstraint.current', { rate: currentConstraint.ratePerSecond })}
            </p>
          )}
          <input
            id={`edge-rate-${edge.id}`}
            name={`edge-rate-${edge.id}`}
            type="text"
            inputMode="decimal"
            value={rateInput}
            placeholder={edgeData?.target ?? edgeData?.source ?? ''}
            onChange={(e) => setRateInput(e.target.value)}
          />
          <div className="editor-inspector__actions">
            <button
              type="button"
              className="editor-inspector__apply"
              onClick={() => {
                const rate = parsePositiveRate(rateInput);
                if (rate == null) return;
                setEdgeConstraint({ edgeId: edge.id, ratePerSecond: rate });
                setRateInput('');
              }}
            >
              {t('editor.edgeConstraint.apply')}
            </button>
            {currentConstraint && (
              <button
                type="button"
                className="editor-inspector__apply"
                onClick={() => clearEdgeConstraint(edge.id)}
              >
                {t('editor.edgeConstraint.clear')}
              </button>
            )}
          </div>
        </div>
      </InspectorSection>
    </div>
  );
}
