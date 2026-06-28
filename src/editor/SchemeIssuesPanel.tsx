import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { TfgpEdge, TfgpNode } from '@/schema/tfgp';
import {
  indexSchemeIssues,
  type SchemeCheckResult,
  type SchemeIssue,
} from '@/scheme-check/check-scheme';
import { isMachineNode } from '@/lib/node-kind';
import type { ActivePack } from '@/data/pack-runtime';
import { getMachineName } from '@/data/pack-registry';

export interface SchemeIssuesPanelProps {
  pack: ActivePack | null;
  lang: 'ru' | 'en';
  nodes: TfgpNode[];
  edges: TfgpEdge[];
  schemeCheck: SchemeCheckResult | null;
  onFocusIssue: (issue: SchemeIssue) => void;
}

function issueRefLabel(
  issue: SchemeIssue,
  nodes: TfgpNode[],
  edges: TfgpEdge[],
  pack: ActivePack | null,
  lang: 'ru' | 'en',
): string {
  const parts: string[] = [];
  if (issue.edgeId) {
    const edge = edges.find((e) => e.id === issue.edgeId);
    if (edge) {
      parts.push(`${edge.source} → ${edge.target}`);
    } else {
      parts.push(issue.edgeId);
    }
  }
  if (issue.nodeId) {
    const node = nodes.find((n) => n.id === issue.nodeId);
    if (node && isMachineNode(node) && pack) {
      parts.push(getMachineName(pack, node.machineId, lang));
    }
    parts.push(issue.nodeId);
  }
  return parts.join(' · ');
}

export function SchemeIssuesPanel({
  pack,
  lang,
  nodes,
  edges,
  schemeCheck,
  onFocusIssue,
}: SchemeIssuesPanelProps) {
  const { t } = useTranslation();
  const grouped = useMemo(() => {
    if (!schemeCheck) return null;
    const errors = schemeCheck.issues.filter((i) => i.severity === 'error');
    const warnings = schemeCheck.issues.filter((i) => i.severity === 'warning');
    return { errors, warnings };
  }, [schemeCheck]);

  if (!schemeCheck || schemeCheck.issues.length === 0) {
    return (
      <section className="scheme-issues scheme-issues--ok" aria-live="polite">
        <h4 className="scheme-issues__title">{t('editor.schemeCheck.title')}</h4>
        <p className="scheme-issues__ok">{t('editor.schemeCheck.ok')}</p>
      </section>
    );
  }

  const renderGroup = (title: string, items: SchemeIssue[], severity: 'error' | 'warning') => {
    if (items.length === 0) return null;
    return (
      <div className={`scheme-issues__group scheme-issues__group--${severity}`}>
        <h5 className="scheme-issues__group-title">{title}</h5>
        <ul className="scheme-issues__list">
          {items.map((issue, idx) => (
            <li key={`${issue.code}-${issue.edgeId ?? ''}-${issue.nodeId ?? ''}-${idx}`}>
              <button
                type="button"
                className={`scheme-issues__item scheme-issues__item--${issue.severity}`}
                onClick={() => onFocusIssue(issue)}
                title={t('editor.schemeCheck.focusHint')}
              >
                <span className="scheme-issues__item-ref">
                  {issueRefLabel(issue, nodes, edges, pack, lang)}
                </span>
                <span className="scheme-issues__item-msg">{issue.message}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  };

  return (
    <section className="scheme-issues" aria-live="polite">
      <h4 className="scheme-issues__title">
        {t('editor.schemeCheck.title')}
        <span className="scheme-issues__counts">
          {schemeCheck.summary.errorCount > 0 && (
            <span className="scheme-issues__count scheme-issues__count--error">
              {t('editor.schemeCheck.errors', { count: schemeCheck.summary.errorCount })}
            </span>
          )}
          {schemeCheck.summary.warningCount > 0 && (
            <span className="scheme-issues__count scheme-issues__count--warning">
              {t('editor.schemeCheck.warnings', { count: schemeCheck.summary.warningCount })}
            </span>
          )}
        </span>
      </h4>
      <p className="scheme-issues__hint">{t('editor.schemeCheck.hint')}</p>
      {renderGroup(
        t('editor.schemeCheck.errorGroup'),
        grouped!.errors,
        'error',
      )}
      {renderGroup(
        t('editor.schemeCheck.warningGroup'),
        grouped!.warnings,
        'warning',
      )}
    </section>
  );
}

export function pickNodeIssueMeta(
  nodeId: string,
  schemeCheck: SchemeCheckResult | null,
): { severity: 'error' | 'warning'; title: string } | undefined {
  if (!schemeCheck) return undefined;
  const index = indexSchemeIssues(schemeCheck);
  const severity = index.worstByNodeId.get(nodeId);
  if (!severity || severity === 'info') return undefined;
  const issues = index.byNodeId.get(nodeId) ?? [];
  const first = issues.find((i) => i.severity === severity);
  return first ? { severity, title: first.message } : undefined;
}

export function pickEdgeIssueMeta(
  edgeId: string,
  schemeCheck: SchemeCheckResult | null,
): { severity: 'error' | 'warning'; title: string } | undefined {
  if (!schemeCheck) return undefined;
  const index = indexSchemeIssues(schemeCheck);
  const severity = index.worstByEdgeId.get(edgeId);
  if (!severity || severity === 'info') return undefined;
  const issues = index.byEdgeId.get(edgeId) ?? [];
  const first = issues.find((i) => i.severity === severity);
  return first ? { severity, title: first.message } : undefined;
}
