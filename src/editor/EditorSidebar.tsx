import { useTranslation } from 'react-i18next';
import { EditorInspector } from '@/editor/EditorInspector';
import { SchemeIssuesPanel } from '@/editor/SchemeIssuesPanel';
import type { FlowResult } from '@/calculator/flow-solver';
import type { SchemeCheckResult } from '@/scheme-check/check-scheme';
import type { ActivePack } from '@/data/pack-runtime';
import type { TfgpEdge, TfgpFile } from '@/schema/tfgp';
import type { FlowEdgeData } from '@/lib/flow-edge-types';
import type { SchemeIssue } from '@/scheme-check/check-scheme';
import type { EditorActions } from '@/editor/editor-actions';

export interface EditorSidebarProps {
  scheme: TfgpFile;
  pack: ActivePack | null;
  lang: 'ru' | 'en';
  flowResult: FlowResult | null;
  flowEdgeData: Record<string, FlowEdgeData>;
  schemeCheckResult: SchemeCheckResult | null;
  selectedNodeIds: string[];
  selectedEdgeIds: string[];
  connectedInByNode: Map<string, Set<string>>;
  connectedOutByNode: Map<string, Set<string>>;
  setSchemeName: EditorActions['setSchemeName'];
  updateNode: EditorActions['updateNode'];
  onFocusIssue: (issue: SchemeIssue) => void;
  onPanToIssue: (issue: SchemeIssue) => void;
  onEdgeRateApply: (edge: TfgpEdge, rate: number) => void;
}

export function EditorSidebar({
  scheme,
  pack,
  lang,
  flowResult,
  flowEdgeData,
  schemeCheckResult,
  selectedNodeIds,
  selectedEdgeIds,
  connectedInByNode,
  connectedOutByNode,
  setSchemeName,
  updateNode,
  onFocusIssue,
  onPanToIssue,
  onEdgeRateApply,
}: EditorSidebarProps) {
  const { t } = useTranslation();

  const handleSchemeNameBlur = () => {
    const trimmed = scheme.meta.name.trim();
    const normalized = trimmed || 'Untitled';
    if (normalized !== scheme.meta.name) {
      setSchemeName(normalized);
    }
  };

  return (
    <aside className="editor-sidebar editor-sidebar-panel">
      <section className="editor-sidebar-section editor-sidebar-section--scheme">
        <div className="editor-sidebar-section__header">
          <h3>{t('editor.schemeEditor')}</h3>
        </div>
        <div className="editor-sidebar-section__body">
          <div className="editor-scheme-name">
            <label htmlFor="scheme-name-input">{t('editor.schemeName')}</label>
            <input
              id="scheme-name-input"
              name="scheme-name"
              type="text"
              value={scheme.meta.name}
              onChange={(e) => setSchemeName(e.target.value)}
              onBlur={handleSchemeNameBlur}
              placeholder={t('editor.schemeNamePlaceholder')}
              spellCheck={false}
            />
          </div>
          <SchemeIssuesPanel
            pack={pack}
            lang={lang}
            nodes={scheme.nodes}
            edges={scheme.edges}
            schemeCheck={schemeCheckResult}
            onFocusIssue={onFocusIssue}
            onPanToIssue={onPanToIssue}
          />
        </div>
      </section>
      <section className="editor-sidebar-section editor-sidebar-section--element">
        <div className="editor-sidebar-section__header">
          <h3>{t('editor.elementEditor')}</h3>
        </div>
        <div className="editor-sidebar-section__body">
          {pack && (
            <EditorInspector
              pack={pack}
              lang={lang}
              nodes={scheme.nodes}
              edges={scheme.edges}
              flowResult={flowResult}
              flowEdgeData={flowEdgeData}
              schemeCheck={schemeCheckResult}
              selectedNodeIds={selectedNodeIds}
              selectedEdgeIds={selectedEdgeIds}
              connectedInByNode={connectedInByNode}
              connectedOutByNode={connectedOutByNode}
              updateNode={updateNode}
              onEdgeRateApply={onEdgeRateApply}
            />
          )}
        </div>
      </section>
    </aside>
  );
}
