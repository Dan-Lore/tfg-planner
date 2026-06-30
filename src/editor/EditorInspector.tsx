import { useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { FlowResult } from '@/calculator/flow-solver';
import {
  allowedTiersForRecipe,
  effectiveDurationTicks,
  effectiveEuPerTick,
  effectiveTotalEu,
  formatEuPerTick,
} from '@/calculator/energy';
import type { VoltageTier } from '@/calculator/gt-voltage';
import { R } from '@/calculator/rational';
import { buildBufferPortDisplays, formatBufferRate } from '@/canvas/BufferNode';
import type { FlowEdgeData } from '@/lib/flow-edge-types';
import { parsePositiveRate } from '@/lib/parse-positive-rate';
import {
  buildInputPortLoadMeta,
  buildNodeBalanceLines,
  buildNodeLoadMeta,
  buildOutputPortLoadMeta,
  rateMapToStrings,
} from '@/canvas/flow-display';
import { buildPortDisplays, type PortDisplay } from '@/canvas/MachineNode';
import { flowLabel } from '@/canvas/ports';
import { SearchCombobox } from '@/components/SearchCombobox';
import { WheelNumberInput } from '@/components/WheelNumberInput';
import { getMachineName, getRecipe, getRecipesForMachine } from '@/data/pack-registry';
import type { PackLike } from '@/data/pack-registry';
import { loadGradientStyle } from '@/lib/load-gradient';
import { formatRecipeDuration } from '@/lib/recipe-duration';
import { formatRecipeLabel } from '@/lib/recipe-label';
import { buildRecipeComboboxItems } from '@/lib/search-combobox';
import { isBufferNode, isMachineNode } from '@/lib/node-kind';
import type { TfgpEdge, TfgpNode, TfgpNodeBase, TfgpSupplyMode } from '@/schema/tfgp';

function formatLoadPercentDisplay(percent: number): string {
  if (percent >= 99.95) return '100%';
  if (percent <= 0.05) return '0%';
  return `${Math.round(percent)}%`;
}

function formatTotalEu(value: number): string {
  if (value >= 1000) return `${Math.round(value)} EU`;
  if (Number.isInteger(value)) return `${value} EU`;
  return `${Math.round(value * 10) / 10} EU`;
}

function getNodeDisplayName(node: TfgpNode, pack: PackLike, lang: 'ru' | 'en'): string {
  if (isMachineNode(node)) {
    return getMachineName(pack, node.machineId, lang);
  }
  if (isBufferNode(node)) {
    const product = flowLabel(
      { itemId: node.itemId, fluidId: node.fluidId, amount: 1 },
      pack,
      lang,
    );
    return product;
  }
  return (node as TfgpNodeBase).id;
}

function InspectorSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="editor-inspector__section">
      <h4 className="editor-inspector__section-title">{title}</h4>
      {children}
    </section>
  );
}

function PortList({
  ports,
  direction,
  t,
}: {
  ports: PortDisplay[];
  direction: 'in' | 'out';
  t: (key: string) => string;
}) {
  if (ports.length === 0) return null;
  return (
    <ul className="editor-inspector__port-list">
      {ports.map((port) => (
        <li key={port.portId} className="editor-inspector__port-row">
          <span className="editor-inspector__port-label" title={port.tooltip ?? port.label}>
            {port.label}
          </span>
          <span className="editor-inspector__port-meta">
            {port.rate && <span className="editor-inspector__port-rate">{port.rate}</span>}
            {(port.loadLabel != null || (direction === 'out' && port.loadPercent != null)) && (
              <span
                className="editor-inspector__port-load"
                style={loadGradientStyle(port.loadPercent ?? 0)}
                title={port.tooltip}
              >
                {formatLoadPercentDisplay(port.loadPercent ?? 0)}
              </span>
            )}
            {!port.connected && (
              <span className="editor-inspector__port-open">{t('editor.inspector.portOpen')}</span>
            )}
          </span>
          <span className="editor-inspector__port-id">
            {direction === 'in' ? t('editor.inspector.portIn') : t('editor.inspector.portOut')}{' '}
            {port.portId}
          </span>
        </li>
      ))}
    </ul>
  );
}

function MachineInspector({
  node,
  pack,
  lang,
  flowResult,
  connectedIn,
  connectedOut,
  updateNode,
}: {
  node: TfgpNode & { kind?: 'machine'; machineId: string; recipeId: string };
  pack: PackLike;
  lang: 'ru' | 'en';
  flowResult: FlowResult | null;
  connectedIn: Set<string>;
  connectedOut: Set<string>;
  updateNode: (id: string, patch: Partial<TfgpNode>) => void;
}) {
  const { t } = useTranslation();
  const recipe = getRecipe(pack, node.recipeId);
  const allowedTiers = recipe ? allowedTiersForRecipe(recipe) : [];

  const recipeItems = useMemo(
    () => buildRecipeComboboxItems(pack, getRecipesForMachine(pack, node.machineId), lang, {
      machineId: node.machineId,
    }),
    [pack, node.machineId, lang],
  );

  const recipeDisplay = recipe ? formatRecipeLabel(pack, recipe, lang) : '';

  const inputRates = rateMapToStrings(flowResult?.nodeInputRates[node.id]);
  const outputRates = rateMapToStrings(flowResult?.nodeOutputRates[node.id]);
  const outputPortRateRationals = flowResult?.nodePortOutputRates[node.id];
  const inputPortLoadMeta = flowResult
    ? buildInputPortLoadMeta(node.id, recipe, connectedIn, flowResult, t)
    : undefined;
  const outputPortLoadMeta = flowResult
    ? buildOutputPortLoadMeta(node.id, recipe, connectedOut, flowResult, t)
    : undefined;
  const nodeLoadMeta = flowResult ? buildNodeLoadMeta(node.id, recipe, flowResult, t) : undefined;
  const { inputPorts, outputPorts } = buildPortDisplays(
    recipe,
    pack,
    lang,
    connectedIn,
    connectedOut,
    inputRates,
    outputRates,
    outputPortRateRationals,
    inputPortLoadMeta,
    outputPortLoadMeta,
  );
  const balanceLines = flowResult
    ? buildNodeBalanceLines(node.id, recipe, connectedIn, flowResult, pack, lang)
    : [];

  const recipeDuration = useMemo(() => {
    if (!recipe) return '';
    const ticks = effectiveDurationTicks(recipe, node.voltageTier, node.overclock);
    return formatRecipeDuration(ticks, lang);
  }, [recipe, node.voltageTier, node.overclock, lang]);

  const euPerTick = useMemo(() => {
    if (!recipe) return undefined;
    const perTick = effectiveEuPerTick(recipe, node.voltageTier);
    if (perTick === undefined) return undefined;
    return perTick * node.machineCount;
  }, [recipe, node.voltageTier, node.machineCount]);

  const totalEu = useMemo(() => {
    if (!recipe) return undefined;
    const total = effectiveTotalEu(recipe, node.voltageTier, node.overclock);
    if (total === undefined) return undefined;
    return total * node.machineCount;
  }, [recipe, node.voltageTier, node.overclock, node.machineCount]);

  return (
    <div className="editor-inspector">
      <p className="editor-inspector__title">
        <strong>{getMachineName(pack, node.machineId, lang)}</strong>
      </p>

      <InspectorSection title={t('editor.inspector.settings')}>
        <label>{t('editor.recipe')}</label>
        <SearchCombobox
          mode="recipe"
          items={recipeItems}
          value={node.recipeId}
          displayValue={recipeDisplay}
          placeholder={t('editor.searchRecipe')}
          resetKey={node.recipeId}
          onChange={(recipeId) => updateNode(node.id, { recipeId })}
        />
        <label htmlFor={`${node.id}-machine-count`}>{t('editor.machineCount')}</label>
        <WheelNumberInput
          min={1}
          step={1}
          value={node.machineCount}
          inputProps={{
            id: `${node.id}-machine-count`,
            name: `${node.id}-machine-count`,
          }}
          onChange={(machineCount) =>
            updateNode(node.id, { machineCount: Math.max(1, machineCount) })
          }
        />
        <label htmlFor={`${node.id}-overclock`}>{t('editor.overclock')}</label>
        <WheelNumberInput
          min={0.1}
          step={0.1}
          value={node.overclock}
          inputProps={{
            id: `${node.id}-overclock`,
            name: `${node.id}-overclock`,
          }}
          onChange={(overclock) => updateNode(node.id, { overclock })}
        />
        {allowedTiers.length > 0 && (
          <>
            <label htmlFor={`${node.id}-voltage-tier`}>{t('editor.voltageTier')}</label>
            <select
              id={`${node.id}-voltage-tier`}
              name={`${node.id}-voltage-tier`}
              className="editor-sidebar__select"
              value={node.voltageTier}
              onChange={(e) =>
                updateNode(node.id, { voltageTier: e.target.value as VoltageTier })
              }
            >
              {allowedTiers.map((tier) => (
                <option key={tier} value={tier}>
                  {tier}
                </option>
              ))}
            </select>
          </>
        )}
      </InspectorSection>

      {(nodeLoadMeta || euPerTick != null || recipeDuration) && (
        <InspectorSection title={t('editor.inspector.calculation')}>
          {nodeLoadMeta && (
            <div
              className="editor-inspector__load-chip"
              style={loadGradientStyle(nodeLoadMeta.currentLoadPercent)}
              title={nodeLoadMeta.title}
            >
              {nodeLoadMeta.label}
            </div>
          )}
          {euPerTick != null && (
            <p className="editor-inspector__meta">
              {t('editor.energyMeta', { value: formatEuPerTick(euPerTick) })}
              {totalEu != null && (
                <>
                  {' · '}
                  {t('editor.totalEuMeta', { value: formatTotalEu(totalEu) })}
                </>
              )}
            </p>
          )}
          {recipeDuration && (
            <p className="editor-inspector__meta">
              {t('editor.inspector.duration')}: {recipeDuration}
            </p>
          )}
        </InspectorSection>
      )}

      {balanceLines.length > 0 && (
        <InspectorSection title={t('editor.inspector.balance')}>
          {balanceLines.map((line) => (
            <div
              key={line.text}
              className={`editor-inspector__balance-line editor-inspector__balance-line--${line.kind}`}
            >
              {line.text}
            </div>
          ))}
        </InspectorSection>
      )}

      {(inputPorts.length > 0 || outputPorts.length > 0) && (
        <InspectorSection title={t('editor.inspector.ports')}>
          <PortList ports={inputPorts} direction="in" t={t} />
          <PortList ports={outputPorts} direction="out" t={t} />
        </InspectorSection>
      )}
    </div>
  );
}

function BufferInspector({
  node,
  pack,
  lang,
  flowResult,
  connectedIn,
  connectedOut,
  updateNode,
}: {
  node: TfgpNode;
  pack: PackLike;
  lang: 'ru' | 'en';
  flowResult: FlowResult | null;
  connectedIn: Set<string>;
  connectedOut: Set<string>;
  updateNode: (id: string, patch: Partial<TfgpNode>) => void;
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

function EdgeInspector({
  edge,
  nodes,
  pack,
  lang,
  flowEdgeData,
  onEdgeRateApply,
}: {
  edge: TfgpEdge;
  nodes: TfgpNode[];
  pack: PackLike;
  lang: 'ru' | 'en';
  flowEdgeData: Record<string, FlowEdgeData>;
  onEdgeRateApply: (edge: TfgpEdge, rate: number) => void;
}) {
  const { t } = useTranslation();
  const [rateInput, setRateInput] = useState('');
  const sourceNode = nodes.find((n) => n.id === edge.source);
  const targetNode = nodes.find((n) => n.id === edge.target);
  const edgeData = flowEdgeData[edge.id];
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
        {edgeData?.source ? (
          <p className="editor-inspector__meta">
            {t('editor.inspector.flowSource')}: <strong>{edgeData.source}</strong>
          </p>
        ) : null}
        {edgeData?.target ? (
          <p className="editor-inspector__meta">
            {t('editor.inspector.flowTarget')}: <strong>{edgeData.target}</strong>
          </p>
        ) : null}
        {!edgeData?.source && !edgeData?.target && (
          <p className="editor-inspector__hint">{t('editor.inspector.noFlow')}</p>
        )}
        {targetNode && isMachineNode(targetNode) && (
          <div className="editor-inspector__field">
            <label htmlFor={`edge-rate-${edge.id}`}>{t('editor.ratePrompt')}</label>
            <input
              id={`edge-rate-${edge.id}`}
              name={`edge-rate-${edge.id}`}
              type="text"
              inputMode="decimal"
              value={rateInput}
              placeholder={edgeData?.target ?? edgeData?.source ?? ''}
              onChange={(e) => setRateInput(e.target.value)}
            />
            <button
              type="button"
              className="editor-inspector__apply"
              onClick={() => {
                const rate = parsePositiveRate(rateInput);
                if (rate == null) return;
                onEdgeRateApply(edge, rate);
                setRateInput('');
              }}
            >
              {t('editor.apply')}
            </button>
          </div>
        )}
      </InspectorSection>
    </div>
  );
}

export interface EditorInspectorProps {
  pack: PackLike;
  lang: 'ru' | 'en';
  nodes: TfgpNode[];
  edges: TfgpEdge[];
  flowResult: FlowResult | null;
  flowEdgeData: Record<string, FlowEdgeData>;
  selectedNodeIds: string[];
  selectedEdgeIds: string[];
  connectedInByNode: Map<string, Set<string>>;
  connectedOutByNode: Map<string, Set<string>>;
  updateNode: (id: string, patch: Partial<TfgpNode>) => void;
  onEdgeRateApply: (edge: TfgpEdge, rate: number) => void;
}

export function EditorInspector({
  pack,
  lang,
  nodes,
  edges,
  flowResult,
  flowEdgeData,
  selectedNodeIds,
  selectedEdgeIds,
  connectedInByNode,
  connectedOutByNode,
  updateNode,
  onEdgeRateApply,
}: EditorInspectorProps) {
  const { t } = useTranslation();

  const singleNodeId = selectedNodeIds.length === 1 ? selectedNodeIds[0] : undefined;
  const singleEdgeId =
    !singleNodeId && selectedEdgeIds.length === 1 ? selectedEdgeIds[0] : undefined;
  const selectionCount = selectedNodeIds.length + selectedEdgeIds.length;

  if (singleNodeId) {
    const node = nodes.find((n) => n.id === singleNodeId);
    if (!node) {
      return <p className="editor-sidebar__hint">{t('editor.inspector.selectElement')}</p>;
    }
    const connectedIn = connectedInByNode.get(node.id) ?? new Set();
    const connectedOut = connectedOutByNode.get(node.id) ?? new Set();

    if (isBufferNode(node)) {
      return (
        <BufferInspector
          node={node}
          pack={pack}
          lang={lang}
          flowResult={flowResult}
          connectedIn={connectedIn}
          connectedOut={connectedOut}
          updateNode={updateNode}
        />
      );
    }

    if (isMachineNode(node)) {
      return (
        <MachineInspector
          node={node}
          pack={pack}
          lang={lang}
          flowResult={flowResult}
          connectedIn={connectedIn}
          connectedOut={connectedOut}
          updateNode={updateNode}
        />
      );
    }
  }

  if (singleEdgeId) {
    const edge = edges.find((e) => e.id === singleEdgeId);
    if (!edge) {
      return <p className="editor-sidebar__hint">{t('editor.inspector.selectElement')}</p>;
    }
    return (
      <EdgeInspector
        edge={edge}
        nodes={nodes}
        pack={pack}
        lang={lang}
        flowEdgeData={flowEdgeData}
        onEdgeRateApply={onEdgeRateApply}
      />
    );
  }

  if (selectionCount > 1) {
    return (
      <p className="editor-sidebar__hint">
        {t('editor.inspector.multiSelect', { count: selectionCount })}
      </p>
    );
  }

  return <p className="editor-sidebar__hint">{t('editor.inspector.selectElement')}</p>;
}
