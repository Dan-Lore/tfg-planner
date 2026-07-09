import type { Edge, Node } from '@xyflow/react';
import type { TFunction } from 'i18next';
import { buildMachinePortDisplaysForNode } from '@/canvas/port-label-stubs';
import {
  buildBufferPortDisplays,
  formatBufferRate,
} from '@/canvas/BufferNode';
import { buildNodeLoadMeta, buildNodeBottleneckMeta } from '@/editor-graph/flow-display';
import type { EditorNodeActions } from '@/canvas/editor-node-actions-context';
import type { NodeDynamicDisplay } from '@/canvas/node-display-context';
import { normalizePortId } from '@/shared/ports';
import { buildFlowDisplayPipeline } from '@/editor-graph/flow-display-pipeline';
import {
  buildLayoutWidthInput,
  getCachedMachineNodeLayoutWidths,
} from '@/editor-graph/layout-width-cache';
import { buildStableRfNodes } from '@/editor-graph/stable-rf-nodes';
import { schemeFlowRevision } from '@/editor-graph/scheme-flow-revision';
import { getRecipe } from '@/data/pack-registry';
import { pickEdgeIssueMeta, pickNodeIssueMeta } from '@/scheme-check/issue-meta';
import { edgeIssueBlocksFlowAnimation } from '@/scheme-check/check-scheme';
import { R } from '@/calculator';
import type { FlowResult } from '@/calculator';
import type { SchemeCheckResult } from '@/scheme-check/check-scheme';
import type { ActivePack } from '@/data/pack-runtime';
import { isBufferNode, isCustomMachineNode } from '@/shared/node-kind';
import {
  buildCustomMachinePortDisplaysForNode,
  customNodeAsScheme,
} from '@/canvas/port-label-stubs';
import { customMachineAsRecipe } from '@/calculator';
import type { TfgpFile } from '@/schema/tfgp';
import type { EditorActions } from '@/editor/editor-actions';

export interface BuildRfGraphParams {
  scheme: TfgpFile;
  pack: ActivePack | null;
  flowResult: FlowResult | null;
  schemeCheckResult: SchemeCheckResult | null;
  lang: 'ru' | 'en';
  packDisplayEpoch: number;
  t: TFunction;
  rfNodeCache: Map<string, { sig: string; node: Node }>;
  updateNode: EditorActions['updateNode'];
  addCustomPort: EditorActions['addCustomPort'];
  removeCustomPort: EditorActions['removeCustomPort'];
  handleRecipeChange: (nodeId: string, recipeId: string) => void;
  handlePortContextMenu: EditorNodeActions['onPortContextMenu'];
}

export interface BuildRfGraphResult {
  connectedPorts: {
    inPorts: Map<string, Set<string>>;
    outPorts: Map<string, Set<string>>;
  };
  layoutWidthByNodeId: Record<string, number>;
  flowEdgeData: ReturnType<typeof buildFlowDisplayPipeline>;
  nodeDisplayById: Record<string, NodeDynamicDisplay>;
  editorNodeActions: EditorNodeActions;
  rfNodes: Node[];
  rfEdges: Edge[];
}

function buildConnectedPorts(scheme: TfgpFile) {
  const inPorts = new Map<string, Set<string>>();
  const outPorts = new Map<string, Set<string>>();
  for (const e of scheme.edges) {
    if (!outPorts.has(e.source)) outPorts.set(e.source, new Set());
    if (!inPorts.has(e.target)) inPorts.set(e.target, new Set());
    outPorts.get(e.source)!.add(normalizePortId(e.sourcePort));
    inPorts.get(e.target)!.add(normalizePortId(e.targetPort));
  }
  return { inPorts, outPorts };
}

function buildEditorNodeActions(
  scheme: TfgpFile,
  updateNode: EditorActions['updateNode'],
  addCustomPort: EditorActions['addCustomPort'],
  removeCustomPort: EditorActions['removeCustomPort'],
  handleRecipeChange: (nodeId: string, recipeId: string) => void,
  handlePortContextMenu: EditorNodeActions['onPortContextMenu'],
): EditorNodeActions {
  return {
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
    onDurationTicksChange: (nodeId, durationTicks) =>
      updateNode(nodeId, { durationTicks }),
    onAddCustomPort: (nodeId, side) => addCustomPort(nodeId, side),
    onRemoveCustomPort: (nodeId, side, index) =>
      removeCustomPort(nodeId, side, index),
    onCustomPortAmountChange: (nodeId, side, index, amount) => {
      const node = scheme.nodes.find((n) => n.id === nodeId);
      if (!node || !isCustomMachineNode(node)) return;
      const key = side === 'in' ? 'inputs' : 'outputs';
      const ports = [...node[key]];
      const current = ports[index];
      if (!current) return;
      ports[index] = { ...current, amount };
      updateNode(nodeId, { [key]: ports });
    },
    onPortContextMenu: handlePortContextMenu,
  };
}

function buildNodeDisplayById(
  scheme: TfgpFile,
  pack: ActivePack,
  connectedPorts: BuildRfGraphResult['connectedPorts'],
  flowResult: FlowResult | null,
  lang: 'ru' | 'en',
  t: TFunction,
): Record<string, NodeDynamicDisplay> {
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

    if (isCustomMachineNode(n)) {
      const bundle = buildCustomMachinePortDisplaysForNode(
        n,
        scheme.edges,
        pack,
        lang,
        connectedIn,
        connectedOut,
        flowResult ?? undefined,
        flowResult ? t : undefined,
      );
      const recipe = customMachineAsRecipe({
        id: n.id,
        kind: 'custom_machine',
        machineId: '__custom__',
        recipeId: `custom:${n.id}`,
        machineCount: n.machineCount,
        overclock: n.overclock,
        voltageTier: 'LV',
        durationTicks: n.durationTicks,
        customInputs: n.inputs,
        customOutputs: n.outputs,
      });
      const nodeLoadMeta = flowResult && recipe
        ? buildNodeLoadMeta(n.id, recipe, flowResult, t)
        : undefined;
      const bottleneckMeta = flowResult && recipe
        ? buildNodeBottleneckMeta(
            customNodeAsScheme(n),
            recipe,
            connectedIn,
            connectedOut,
            flowResult,
            pack,
            lang,
            t,
          )
        : undefined;
      map[n.id] = {
        inputPorts: bundle.inputPorts,
        outputPorts: bundle.outputPorts,
        balanceLines: bundle.balanceLines,
        loadPercent: nodeLoadMeta?.currentLoadPercent,
        loadLabel: nodeLoadMeta?.label,
        loadTitle: nodeLoadMeta?.title,
        bottleneckLabel: bottleneckMeta?.shortLabel,
        bottleneckTitle: bottleneckMeta?.title,
      };
      continue;
    }

    const recipe = getRecipe(pack, n.recipeId);
    const nodeLoadMeta = flowResult
      ? buildNodeLoadMeta(n.id, recipe, flowResult, t)
      : undefined;
    const bottleneckMeta = flowResult
      ? buildNodeBottleneckMeta(n, recipe, connectedIn, connectedOut, flowResult, pack, lang, t)
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
      bottleneckLabel: bottleneckMeta?.shortLabel,
      bottleneckTitle: bottleneckMeta?.title,
    };
  }
  return map;
}

export function buildRfGraph(params: BuildRfGraphParams): BuildRfGraphResult {
  const {
    scheme,
    pack,
    flowResult,
    schemeCheckResult,
    lang,
    packDisplayEpoch,
    t,
    rfNodeCache,
    updateNode,
    addCustomPort,
    removeCustomPort,
    handleRecipeChange,
    handlePortContextMenu,
  } = params;

  const connectedPorts = buildConnectedPorts(scheme);
  const schemeRevision = schemeFlowRevision(scheme);

  const layoutWidthByNodeId = pack
    ? getCachedMachineNodeLayoutWidths(
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
      )
    : {};

  const flowEdgeData =
    pack && flowResult
      ? buildFlowDisplayPipeline(
          scheme,
          pack,
          flowResult,
          lang,
          t,
          layoutWidthByNodeId,
        )
      : {};

  const editorNodeActions = buildEditorNodeActions(
    scheme,
    updateNode,
    addCustomPort,
    removeCustomPort,
    handleRecipeChange,
    handlePortContextMenu,
  );

  const nodeDisplayById = pack
    ? buildNodeDisplayById(scheme, pack, connectedPorts, flowResult, lang, t)
    : {};

  const rfNodes: Node[] = pack
    ? buildStableRfNodes(
        scheme.nodes,
        rfNodeCache,
        {
          pack,
          edges: scheme.edges,
          layoutWidthByNodeId,
        },
        (id) =>
          pickNodeIssueMeta(id, schemeCheckResult, pack, lang, scheme.nodes, scheme.edges, t) ??
          {},
      )
    : [];

  const rfEdges: Edge[] = scheme.edges.map((e) => {
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
      animated:
        Boolean(flowEdgeData[e.id]?.source) &&
        !edgeIssueBlocksFlowAnimation(e.id, schemeCheckResult),
    };
  });

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
