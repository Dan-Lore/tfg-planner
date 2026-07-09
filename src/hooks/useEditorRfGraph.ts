import { useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { Node } from '@xyflow/react';
import type { EditorNodeActions } from '@/canvas/editor-node-actions-context';
import { buildRfGraph } from '@/editor/build-rf-graph';
import type { FlowResult } from '@/calculator';
import type { SchemeCheckResult } from '@/scheme-check/check-scheme';
import type { ActivePack } from '@/data/pack-runtime';
import type { TfgpFile } from '@/schema/tfgp';
import type { EditorActions } from '@/editor/editor-actions';

export function useEditorRfGraph(params: {
  scheme: TfgpFile;
  pack: ActivePack | null;
  flowResult: FlowResult | null;
  schemeCheckResult: SchemeCheckResult | null;
  lang: 'ru' | 'en';
  packDisplayEpoch: number;
  updateNode: EditorActions['updateNode'];
  addCustomPort: EditorActions['addCustomPort'];
  removeCustomPort: EditorActions['removeCustomPort'];
  handleRecipeChange: (nodeId: string, recipeId: string) => void;
  handlePortContextMenu: EditorNodeActions['onPortContextMenu'];
}) {
  const {
    scheme,
    pack,
    flowResult,
    schemeCheckResult,
    lang,
    packDisplayEpoch,
    updateNode,
    addCustomPort,
    removeCustomPort,
    handleRecipeChange,
    handlePortContextMenu,
  } = params;

  const { t } = useTranslation();
  const rfNodeCacheRef = useRef(new Map<string, { sig: string; node: Node }>());

  return useMemo(
    () =>
      buildRfGraph({
        scheme,
        pack,
        flowResult,
        schemeCheckResult,
        lang,
        packDisplayEpoch,
        t,
        rfNodeCache: rfNodeCacheRef.current,
        updateNode,
        addCustomPort,
        removeCustomPort,
        handleRecipeChange,
        handlePortContextMenu,
      }),
    [
      scheme,
      pack,
      flowResult,
      schemeCheckResult,
      lang,
      packDisplayEpoch,
      t,
      updateNode,
      addCustomPort,
      removeCustomPort,
      handleRecipeChange,
      handlePortContextMenu,
    ],
  );
}
