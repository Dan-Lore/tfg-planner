import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { FlowResult } from '@/calculator';
import { formatEuPerTick } from '@/calculator';
import { flowLabel } from '@/canvas/ports';
import { getMachineName, getRecipe } from '@/data/pack-registry';
import type { PackLike } from '@/data/pack-registry';
import type { FlowEdgeData } from '@/editor-graph/flow-edge-types';
import { sumSelectionEnergyEuPerTick } from '@/editor-graph/selection-energy';
import { isBufferNode, isCustomMachineNode, isMachineNode } from '@/shared/node-kind';
import type { TfgpEdge, TfgpEdgeConstraint, TfgpNode, TfgpNodeBase } from '@/schema/tfgp';
import type { EditorActions } from '@/editor/editor-actions';
import { BufferInspector } from '@/editor/inspector/BufferInspector';
import { CustomMachineInspector } from '@/editor/inspector/CustomMachineInspector';
import { MachineInspector } from '@/editor/inspector/MachineInspector';
import type { SchemeCheckResult } from '@/scheme-check/check-scheme';
import { formatSchemeIssueSummary } from '@/scheme-check/format-scheme-issue';
import { listNodeIssues } from '@/scheme-check/issue-meta';

export interface EditorInspectorProps {
  pack: PackLike;
  lang: 'ru' | 'en';
  nodes: TfgpNode[];
  edges: TfgpEdge[];
  flowResult: FlowResult | null;
  flowEdgeData: Record<string, FlowEdgeData>;
  schemeCheck: SchemeCheckResult | null;
  selectedNodeIds: string[];
  selectedEdgeIds: string[];
  connectedInByNode: Map<string, Set<string>>;
  connectedOutByNode: Map<string, Set<string>>;
  updateNode: (id: string, patch: Partial<TfgpNode>) => void;
  addCustomPort: EditorActions['addCustomPort'];
  removeCustomPort: EditorActions['removeCustomPort'];
  edgeConstraints: TfgpEdgeConstraint[];
  setEdgeConstraint: EditorActions['setEdgeConstraint'];
  clearEdgeConstraint: EditorActions['clearEdgeConstraint'];
}

export function formatLoadPercentDisplay(percent: number): string {
  if (percent >= 99.95) return '100%';
  if (percent <= 0.05) return '0%';
  return `${Math.round(percent)}%`;
}

export function formatInspectorTotalEu(value: number): string {
  if (value >= 1000) return `${Math.round(value)} EU`;
  if (Number.isInteger(value)) return `${value} EU`;
  return `${Math.round(value * 10) / 10} EU`;
}

export function getNodeDisplayName(node: TfgpNode, pack: PackLike, lang: 'ru' | 'en'): string {
  if (isCustomMachineNode(node)) {
    return node.label?.trim() || (lang === 'en' ? 'Custom process' : 'Произвольный процесс');
  }
  if (isMachineNode(node)) {
    return getMachineName(pack, node.machineId, lang);
  }
  if (isBufferNode(node)) {
    return flowLabel(
      { itemId: node.itemId, fluidId: node.fluidId, amount: 1 },
      pack,
      lang,
    );
  }
  return (node as TfgpNodeBase).id;
}

export function InspectorSection({
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

export function NodeIssuesSection({
  nodeId,
  schemeCheck,
  pack,
  lang,
  nodes,
  edges,
}: {
  nodeId: string;
  schemeCheck: SchemeCheckResult | null;
  pack: PackLike;
  lang: 'ru' | 'en';
  nodes: TfgpNode[];
  edges: TfgpEdge[];
}) {
  const { t } = useTranslation();
  const issues = listNodeIssues(nodeId, schemeCheck);
  if (issues.length === 0) return null;

  return (
    <InspectorSection title={t('editor.schemeCheck.title')}>
      <ul className="editor-inspector__issue-list">
        {issues.map((issue, idx) => (
          <li
            key={`${issue.code}-${issue.edgeId ?? ''}-${issue.context?.portId ?? ''}-${idx}`}
            className={`editor-inspector__issue editor-inspector__issue--${issue.severity}`}
          >
            {formatSchemeIssueSummary(issue, pack, lang, nodes, edges, t)}
          </li>
        ))}
      </ul>
    </InspectorSection>
  );
}

export function MultiSelectInspector({
  pack,
  nodes,
  selectedNodeIds,
  selectionCount,
  t,
}: {
  pack: PackLike;
  nodes: TfgpNode[];
  selectedNodeIds: string[];
  selectionCount: number;
  t: (key: string, options?: Record<string, unknown>) => string;
}) {
  const selectionEnergy = sumSelectionEnergyEuPerTick(
    nodes,
    selectedNodeIds,
    (recipeId) => getRecipe(pack, recipeId),
  );

  return (
    <div className="editor-inspector">
      <p className="editor-sidebar__hint">
        {t('editor.inspector.multiSelect', { count: selectionCount })}
      </p>
      {selectionEnergy !== undefined && (
        <InspectorSection title={t('editor.selectionEnergy.title')}>
          <p className="editor-inspector__meta">
            {t('editor.selectionEnergy.total', {
              value: formatEuPerTick(selectionEnergy),
            })}
          </p>
        </InspectorSection>
      )}
    </div>
  );
}

export function renderNodeInspector({
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
  addCustomPort,
  removeCustomPort,
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
  addCustomPort: EditorActions['addCustomPort'];
  removeCustomPort: EditorActions['removeCustomPort'];
}): ReactNode {
  const common = {
    pack,
    lang,
    flowResult,
    connectedIn,
    connectedOut,
    updateNode,
    schemeCheck,
    nodes,
    edges,
  };

  if (isBufferNode(node)) {
    return <BufferInspector node={node} {...common} />;
  }

  if (isCustomMachineNode(node)) {
    return (
      <CustomMachineInspector
        node={node}
        {...common}
        addCustomPort={addCustomPort}
        removeCustomPort={removeCustomPort}
      />
    );
  }

  if (isMachineNode(node)) {
    return <MachineInspector node={node} {...common} />;
  }

  return null;
}
