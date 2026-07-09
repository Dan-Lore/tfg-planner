import { useTranslation } from 'react-i18next';
import type { FlowResult } from '@/calculator';
import { customMachineAsRecipe } from '@/calculator';
import { buildNodeLoadMeta, buildNodeBottleneckMeta } from '@/canvas/flow-display';
import type { PortDisplay } from '@/canvas/MachineNode';
import { buildCustomMachinePortDisplaysForNode, customNodeAsScheme } from '@/canvas/port-label-stubs';
import { WheelNumberInput } from '@/components/WheelNumberInput';
import type { PackLike } from '@/data/pack-registry';
import { resolveCustomPortLabel } from '@/editor-graph/custom-port-label';
import { loadGradientStyle } from '@/lib/load-gradient';
import { clampMachineCount } from '@/lib/machine-count';
import { formatRecipeDuration } from '@/lib/recipe-duration';
import type { TfgpCustomMachineNode, TfgpEdge, TfgpNode } from '@/schema/tfgp';
import type { EditorActions } from '@/editor/editor-actions';
import type { SchemeCheckResult } from '@/scheme-check/check-scheme';
import {
  getNodeDisplayName,
  InspectorSection,
  NodeIssuesSection,
} from '@/editor/inspector/inspector-shared';

export function CustomMachineInspector({
  node,
  pack,
  lang,
  flowResult,
  connectedIn,
  connectedOut,
  edges,
  updateNode,
  addCustomPort,
  removeCustomPort,
  schemeCheck,
  nodes,
}: {
  node: TfgpCustomMachineNode;
  pack: PackLike;
  lang: 'ru' | 'en';
  flowResult: FlowResult | null;
  connectedIn: Set<string>;
  connectedOut: Set<string>;
  edges: TfgpEdge[];
  updateNode: (id: string, patch: Partial<TfgpNode>) => void;
  addCustomPort: EditorActions['addCustomPort'];
  removeCustomPort: EditorActions['removeCustomPort'];
  schemeCheck: SchemeCheckResult | null;
  nodes: TfgpNode[];
}) {
  const { t } = useTranslation();

  const bundle = buildCustomMachinePortDisplaysForNode(
    node,
    edges,
    pack,
    lang,
    connectedIn,
    connectedOut,
    flowResult ?? undefined,
    flowResult ? t : undefined,
  );

  const recipe = customMachineAsRecipe(customNodeAsScheme(node));
  const nodeLoadMeta = flowResult && recipe
    ? buildNodeLoadMeta(node.id, recipe, flowResult, t)
    : undefined;
  const bottleneckMeta =
    flowResult && recipe
      ? buildNodeBottleneckMeta(
          customNodeAsScheme(node),
          recipe,
          connectedIn,
          connectedOut,
          flowResult,
          pack,
          lang,
          t,
        )
      : undefined;

  const effectiveTicks = Math.round(
    node.durationTicks / Math.max(node.overclock, 0.1),
  );
  const durationLabel = formatRecipeDuration(effectiveTicks, lang);

  const updatePortAmount = (side: 'in' | 'out', index: number, amount: number) => {
    const key = side === 'in' ? 'inputs' : 'outputs';
    const ports = [...node[key]];
    const current = ports[index];
    if (!current) return;
    ports[index] = { ...current, amount: Math.max(0.1, amount) };
    updateNode(node.id, { [key]: ports });
  };

  const updatePortLabel = (side: 'in' | 'out', index: number, rawLabel: string) => {
    const key = side === 'in' ? 'inputs' : 'outputs';
    const ports = [...node[key]];
    const current = ports[index];
    if (!current) return;
    const trimmed = rawLabel.trim();
    const { label: _prev, ...rest } = current;
    ports[index] = trimmed ? { ...rest, label: trimmed, amount: current.amount } : { ...rest, amount: current.amount };
    updateNode(node.id, { [key]: ports });
  };

  const portHasEdge = (side: 'in' | 'out', index: number): boolean => {
    const portId = side === 'in' ? `in_${index}` : `out_${index}`;
    return edges.some(
      (e) =>
        (e.source === node.id && e.sourcePort === portId) ||
        (e.target === node.id && e.targetPort === portId),
    );
  };

  const renderEditablePorts = (
    side: 'in' | 'out',
    ports: typeof node.inputs,
    displays: PortDisplay[],
  ) => (
    <ul className="editor-inspector__port-list editor-inspector__port-list--editable">
      {ports.map((port, index) => {
        const display = displays[index];
        const portId = side === 'in' ? `in_${index}` : `out_${index}`;
        const fallbackLabel = resolveCustomPortLabel(
          port,
          portId,
          edges,
          node.id,
          pack,
          lang,
          side,
          t('editor.customMachine.emptyPort'),
        );
        const connected = display?.connected ?? portHasEdge(side, index);
        return (
          <li key={`${side}-${index}`} className="editor-inspector__port-row editor-inspector__port-row--editable">
            <label className="editor-inspector__port-name-label">
              {t('editor.inspector.portLabel')}
              <input
                type="text"
                className="editor-inspector__port-name-input"
                value={port.label ?? ''}
                placeholder={fallbackLabel}
                spellCheck={false}
                onChange={(e) => updatePortLabel(side, index, e.target.value)}
              />
            </label>
            <label className="editor-inspector__port-amount-label">
              {t('editor.inspector.portAmount')}
              <WheelNumberInput
                min={0.1}
                step={0.1}
                value={port.amount}
                className="editor-inspector__port-amount-input"
                onChange={(amount) => updatePortAmount(side, index, amount)}
              />
            </label>
            {display?.rate && (
              <span className="editor-inspector__port-rate">{display.rate}</span>
            )}
            {!connected && (
              <button
                type="button"
                className="editor-inspector__port-remove"
                title={t('editor.customMachine.removePort')}
                onClick={() => removeCustomPort(node.id, side, index)}
              >
                ×
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );

  return (
    <div className="editor-inspector">
      <p className="editor-inspector__title">
        <strong>{getNodeDisplayName(node, pack, lang)}</strong>
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
        <label htmlFor={`${node.id}-custom-label`}>{t('editor.inspector.customLabel')}</label>
        <input
          id={`${node.id}-custom-label`}
          type="text"
          value={node.label ?? ''}
          placeholder={t('editor.customMachine.title')}
          onChange={(e) => updateNode(node.id, { label: e.target.value })}
        />
        <label htmlFor={`${node.id}-custom-machine-count`}>{t('editor.machineCount')}</label>
        <WheelNumberInput
          min={0}
          step={1}
          value={node.machineCount}
          inputProps={{ id: `${node.id}-custom-machine-count` }}
          onChange={(machineCount) =>
            updateNode(node.id, { machineCount: clampMachineCount(machineCount) })
          }
        />
        <label htmlFor={`${node.id}-custom-overclock`}>{t('editor.overclock')}</label>
        <WheelNumberInput
          min={0.1}
          step={0.1}
          value={node.overclock}
          inputProps={{ id: `${node.id}-custom-overclock` }}
          onChange={(overclock) => updateNode(node.id, { overclock })}
        />
        <label htmlFor={`${node.id}-custom-duration`}>{t('editor.inspector.durationTicks')}</label>
        <WheelNumberInput
          min={1}
          step={1}
          value={node.durationTicks}
          inputProps={{ id: `${node.id}-custom-duration` }}
          onChange={(durationTicks) =>
            updateNode(node.id, { durationTicks: Math.max(1, durationTicks) })
          }
        />
        <p className="editor-inspector__hint">
          {t('editor.inspector.duration')}: {durationLabel}
        </p>
      </InspectorSection>

      {(nodeLoadMeta || bundle.balanceLines.length > 0) && (
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
          {bundle.balanceLines.map((line) => (
            <div
              key={line.text}
              className={`editor-inspector__balance-line editor-inspector__balance-line--${line.kind}`}
            >
              {line.text}
            </div>
          ))}
        </InspectorSection>
      )}

      <InspectorSection title={t('editor.inspector.ports')}>
        <h5 className="editor-inspector__subsection">{t('editor.inspector.inputs')}</h5>
        {renderEditablePorts('in', node.inputs, bundle.inputPorts)}
        <button
          type="button"
          className="editor-inspector__add-port"
          onClick={() => addCustomPort(node.id, 'in')}
        >
          {t('editor.customMachine.addInput')}
        </button>
        <h5 className="editor-inspector__subsection">{t('editor.inspector.outputs')}</h5>
        {renderEditablePorts('out', node.outputs, bundle.outputPorts)}
        <button
          type="button"
          className="editor-inspector__add-port"
          onClick={() => addCustomPort(node.id, 'out')}
        >
          {t('editor.customMachine.addOutput')}
        </button>
      </InspectorSection>
    </div>
  );
}
