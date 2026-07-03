import { useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { Edge, Node } from '@xyflow/react';
import { buildMachinePortDisplaysForNode } from '@/canvas/port-label-stubs';
import {
  buildBufferPortDisplays,
  formatBufferRate,
} from '@/canvas/BufferNode';
import { buildNodeLoadMeta } from '@/canvas/flow-display';
import type { EditorNodeActions } from '@/canvas/editor-node-actions-context';
import type { NodeDynamicDisplay } from '@/canvas/node-display-context';
import { normalizePortId } from '@/lib/ports';
import { buildFlowDisplayPipeline } from '@/lib/flow-display-pipeline';
import {
  buildLayoutWidthInput,
  getCachedMachineNodeLayoutWidths,
} from '@/lib/layout-width-cache';
import { buildStableRfNodes } from '@/lib/stable-rf-nodes';
import { schemeFlowRevision } from '@/lib/scheme-flow-revision';
import { getRecipe } from '@/data/pack-registry';
import { pickEdgeIssueMeta, pickNodeIssueMeta } from '@/editor/SchemeIssuesPanel';
import { R } from '@/calculator/rational';
import type { FlowResult } from '@/calculator/flow-solver';
import type { SchemeCheckResult } from '@/scheme-check/check-scheme';
import type { ActivePack } from '@/data/pack-runtime';
import { isBufferNode } from '@/lib/node-kind';
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
    handleRecipeChange,
    handlePortContextMenu,
  } = params;

  const { t } = useTranslation();

  const connectedPorts = useMemo(() => {
    const inPorts = new Map<string, Set<string>>();
    const outPorts = new Map<string, Set<string>>();
    for (const e of scheme.edges) {
      if (!outPorts.has(e.source)) outPorts.set(e.source, new Set());
      if (!inPorts.has(e.target)) inPorts.set(e.target, new Set());
      outPorts.get(e.source)!.add(normalizePortId(e.sourcePort));
      inPorts.get(e.target)!.add(normalizePortId(e.targetPort));
    }
    return { inPorts, outPorts };
  }, [scheme.edges]);

  const schemeRevision = useMemo(() => schemeFlowRevision(scheme), [scheme]);

  const layoutWidthByNodeId = useMemo(() => {
    if (!pack) return {};
    return getCachedMachineNodeLayoutWidths(
      buildLayoutWidthInput(
        scheme.nodes,
        scheme.edges,
        schemeRevision,
        lang,
        pack,
        flowResult,
        connectedPorts.inPorts,
        connectedPorts.outPorts,
        t,
        packDisplayEpoch,
      ),
    );
  }, [
    scheme.nodes,
    scheme.edges,
    schemeRevision,
    pack,
    lang,
    flowResult,
    connectedPorts,
    packDisplayEpoch,
    t,
  ]);

  const flowEdgeData = useMemo(() => {
    if (!pack || !flowResult) return {};
    return buildFlowDisplayPipeline(
      scheme,
      pack,
      flowResult,
      lang,
      t,
      layoutWidthByNodeId,
    );
  }, [
    scheme,
    pack,
    flowResult,
    lang,
    t,
    schemeRevision,
    packDisplayEpoch,
    layoutWidthByNodeId,
  ]);

  const editorNodeActions = useMemo<EditorNodeActions>(
    () => ({
      onRecipeChange: handleRecipeChange,
      onMachineCountChange: (nodeId, machineCount) =>
        updateNode(nodeId, { machineCount }),
      onOverclockChange: (nodeId, overclock) => updateNode(nodeId, { overclock }),
      onVoltageTierChange: (nodeId, voltageTier) =>
        updateNode(nodeId, { voltageTier }),
      onCapacityChange: (nodeId, capacity) => updateNode(nodeId, { capacity }),
      onSupplyModeChange: (nodeId, supplyMode) =>
        updateNode(nodeId, { supplyMode }),
      onSupplyRateChange: (nodeId, supplyRate) =>
        updateNode(nodeId, { supplyRate }),
      onInitialStockChange: (nodeId, initialStock) =>
        updateNode(nodeId, { initialStock }),
      onPortContextMenu: handlePortContextMenu,
    }),
    [handleRecipeChange, handlePortContextMenu, updateNode],
  );

  const nodeDisplayById = useMemo(() => {
    if (!pack) return {};
    const map: Record<string, NodeDynamicDisplay> = {};
    for (const n of scheme.nodes) {
      const connectedIn = connectedPorts.inPorts.get(n.id) ?? new Set();
      const connectedOut = connectedPorts.outPorts.get(n.id) ?? new Set();

      if (isBufferNode(n)) {
        const inRate = formatBufferRate(
          flowResult?.nodeInputRates[n.id]
            ? Object.values(flowResult.nodeInputRates[n.id]!)[0]
            : undefined,
        );
        const outRate = formatBufferRate(
          flowResult?.nodePortOutputRates[n.id]?.out_0,
        );
        const inLoad = flowResult?.nodePortInLoad[n.id]?.in_0
          ?.mul(R.from(100))
          .toNumber();
        const outLoad = flowResult?.nodePortOutLoad[n.id]?.out_0
          ?.mul(R.from(100))
          .toNumber();
        const loadFraction = flowResult?.nodeLoad[n.id];
        const loadPercent = loadFraction
          ? Math.min(100, Math.max(0, loadFraction.mul(R.from(100)).toNumber()))
          : undefined;
        const { inputPorts, outputPorts } = buildBufferPortDisplays(
          n.kind,
          pack,
          lang,
          n.itemId,
          n.fluidId,
          connectedIn,
          connectedOut,
          inRate,
          outRate,
          inLoad,
          outLoad,
        );
        map[n.id] = {
          inputPorts,
          outputPorts,
          balanceLines: [],
          loadPercent,
          loadLabel:
            loadPercent != null
              ? t('editor.nodeLoadMeta', {
                  value: `${Math.round(loadPercent)}%`,
                })
              : undefined,
        };
        continue;
      }

      const recipe = getRecipe(pack, n.recipeId);
      const nodeLoadMeta = flowResult
        ? buildNodeLoadMeta(n.id, recipe, flowResult, t)
        : undefined;
      const bundle = buildMachinePortDisplaysForNode(
        n,
        scheme.edges,
        pack,
        lang,
        connectedIn,
        connectedOut,
        flowResult ?? undefined,
        flowResult ? t : undefined,
      );
      map[n.id] = {
        inputPorts: bundle.inputPorts,
        outputPorts: bundle.outputPorts,
        balanceLines: bundle.balanceLines,
        loadPercent: nodeLoadMeta?.currentLoadPercent,
        loadLabel: nodeLoadMeta?.label,
        loadTitle: nodeLoadMeta?.title,
      };
    }
    return map;
  }, [
    scheme.nodes,
    scheme.edges,
    pack,
    connectedPorts,
    flowResult,
    lang,
    packDisplayEpoch,
    t,
  ]);

  const rfNodeCacheRef = useRef(new Map<string, { sig: string; node: Node }>());

  const rfNodes: Node[] = useMemo(() => {
    if (!pack) return [];
    return buildStableRfNodes(
      scheme.nodes,
      rfNodeCacheRef.current,
      {
        pack,
        edges: scheme.edges,
        layoutWidthByNodeId,
      },
      (id) =>
        pickNodeIssueMeta(id, schemeCheckResult, pack, lang, scheme.nodes, scheme.edges, t) ?? {},
    );
  }, [scheme.nodes, scheme.edges, pack, schemeCheckResult, layoutWidthByNodeId, packDisplayEpoch, lang, t]);

  const rfEdges: Edge[] = useMemo(
    () =>
      scheme.edges.map((e) => {
        const edgeIssue = pickEdgeIssueMeta(
          e.id,
          schemeCheckResult,
          pack,
          lang,
          scheme.nodes,
          scheme.edges,
          t,
        );
        const baseData = flowEdgeData[e.id] ?? {};
        return {
          id: e.id,
          source: e.source,
          target: e.target,
          sourceHandle: normalizePortId(e.sourcePort),
          targetHandle: normalizePortId(e.targetPort),
          type: 'flow',
          data: {
            ...baseData,
            checkSeverity: edgeIssue?.severity,
            checkTitle: edgeIssue?.title,
          },
          animated: Boolean(flowEdgeData[e.id]?.source) && !edgeIssue,
        };
      }),
    [scheme.edges, flowEdgeData, schemeCheckResult, pack, lang, scheme.nodes, t],
  );

  return {
    connectedPorts,
    layoutWidthByNodeId,
    flowEdgeData,
    nodeDisplayById,
    editorNodeActions,
    rfNodes,
    rfEdges,
  };
}
