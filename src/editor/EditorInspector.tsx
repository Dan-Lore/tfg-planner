import { useTranslation } from 'react-i18next';
import { EdgeInspector } from '@/editor/inspector/EdgeInspector';
import {
  type EditorInspectorProps,
  MultiSelectInspector,
  renderNodeInspector,
} from '@/editor/inspector/inspector-shared';

export type { EditorInspectorProps } from '@/editor/inspector/inspector-shared';
export { PortList } from '@/editor/inspector/PortList';
export { BufferInspector } from '@/editor/inspector/BufferInspector';
export { CustomMachineInspector } from '@/editor/inspector/CustomMachineInspector';
export { EdgeInspector } from '@/editor/inspector/EdgeInspector';
export { MachineInspector } from '@/editor/inspector/MachineInspector';

export function EditorInspector({
  pack,
  lang,
  nodes,
  edges,
  flowResult,
  flowEdgeData,
  schemeCheck,
  selectedNodeIds,
  selectedEdgeIds,
  connectedInByNode,
  connectedOutByNode,
  updateNode,
  addCustomPort,
  removeCustomPort,
  edgeConstraints,
  setEdgeConstraint,
  clearEdgeConstraint,
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
    return renderNodeInspector({
      node,
      pack,
      lang,
      flowResult,
      connectedIn: connectedInByNode.get(node.id) ?? new Set(),
      connectedOut: connectedOutByNode.get(node.id) ?? new Set(),
      updateNode,
      schemeCheck,
      nodes,
      edges,
      addCustomPort,
      removeCustomPort,
    });
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
        flowResult={flowResult}
        flowEdgeData={flowEdgeData}
        edgeConstraints={edgeConstraints}
        setEdgeConstraint={setEdgeConstraint}
        clearEdgeConstraint={clearEdgeConstraint}
      />
    );
  }

  if (selectionCount > 1) {
    return (
      <MultiSelectInspector
        pack={pack}
        nodes={nodes}
        selectedNodeIds={selectedNodeIds}
        selectionCount={selectionCount}
        t={t}
      />
    );
  }

  return <p className="editor-sidebar__hint">{t('editor.inspector.selectElement')}</p>;
}
