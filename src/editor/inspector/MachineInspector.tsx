import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { FlowResult } from '@/calculator';
import {
  allowedTiersForRecipe,
  effectiveDurationTicks,
  effectiveEuPerTick,
  effectiveTotalEu,
  formatEuPerTick,
} from '@/calculator';
import type { VoltageTier } from '@/calculator';
import {
  buildInputPortLoadMeta,
  buildNodeBalanceLines,
  buildNodeLoadMeta,
  buildNodeBottleneckMeta,
  buildOutputPortLoadMeta,
  rateMapToStrings,
} from '@/canvas/flow-display';
import { buildPortDisplays } from '@/canvas/MachineNode';
import { SearchCombobox } from '@/components/SearchCombobox';
import { WheelNumberInput } from '@/components/WheelNumberInput';
import { getMachineName, getRecipe, getRecipesForMachine } from '@/data/pack-registry';
import type { PackLike } from '@/data/pack-registry';
import { loadGradientStyle } from '@/lib/load-gradient';
import { formatRecipeDuration } from '@/lib/recipe-duration';
import { formatRecipeLabel } from '@/lib/recipe-label';
import { buildRecipeComboboxItems } from '@/lib/search-combobox';
import { clampMachineCount } from '@/lib/machine-count';
import type { TfgpEdge, TfgpMachineNode, TfgpNode } from '@/schema/tfgp';
import type { SchemeCheckResult } from '@/scheme-check/check-scheme';
import {
  formatInspectorTotalEu,
  InspectorSection,
  NodeIssuesSection,
} from '@/editor/inspector/inspector-shared';
import { PortList } from '@/editor/inspector/PortList';

export function MachineInspector({
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
  node: TfgpMachineNode;
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
    ? buildInputPortLoadMeta(node, recipe, connectedIn, flowResult, t)
    : undefined;
  const outputPortLoadMeta = flowResult
    ? buildOutputPortLoadMeta(node.id, recipe, connectedOut, flowResult, t)
    : undefined;
  const nodeLoadMeta = flowResult ? buildNodeLoadMeta(node.id, recipe, flowResult, t) : undefined;
  const bottleneckMeta =
    flowResult && recipe
      ? buildNodeBottleneckMeta(node, recipe, connectedIn, connectedOut, flowResult, pack, lang, t)
      : undefined;
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

      <NodeIssuesSection
        nodeId={node.id}
        schemeCheck={schemeCheck}
        pack={pack}
        lang={lang}
        nodes={nodes}
        edges={edges}
      />

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
          min={0}
          step={1}
          value={node.machineCount}
          inputProps={{
            id: `${node.id}-machine-count`,
            name: `${node.id}-machine-count`,
          }}
          onChange={(machineCount) =>
            updateNode(node.id, { machineCount: clampMachineCount(machineCount) })
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
          {bottleneckMeta && (
            <p className="editor-inspector__bottleneck" title={bottleneckMeta.title}>
              {bottleneckMeta.shortLabel}
            </p>
          )}
          {euPerTick != null && (
            <p className="editor-inspector__meta">
              {t('editor.energyMeta', { value: formatEuPerTick(euPerTick) })}
              {totalEu != null && (
                <>
                  {' · '}
                  {t('editor.totalEuMeta', { value: formatInspectorTotalEu(totalEu) })}
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
