import { schemeFlowRevision } from '@/lib/scheme-flow-revision';
import { shouldApplyFlowResult } from '@/lib/flow-compute-guard';
import { debounceFlowUpdate } from '@/lib/debounce-flow-update';
import { mergePendingFlowUpdateMode } from '@/lib/flow-compute-queue';
import { computeFlowsAsync, type FlowComputeMode } from '@/lib/flow-compute';
import { hydrateFlowResult } from '@/calculator/flow-result-transfer';
import { runSchemeCheck } from '@/scheme-check/run-scheme-check';
import { sliceAsPackData } from '@/data/pack-slice';
import { usePackStore } from '@/stores/pack-store';
import {
  cacheFlows,
  cacheScheme,
  getEditorBindings,
} from '@/stores/editor-store-shared';

let debouncedFlowUpdate: ReturnType<typeof debounceFlowUpdate> | null = null;
let pendingFlowUpdateMode: FlowComputeMode | null = null;

export function initFlowComputeRuntime(): void {
  if (!debouncedFlowUpdate) {
    debouncedFlowUpdate = debounceFlowUpdate(() => {
      void runFlowCompute('update');
    });
  }
}

function flushPendingFlowUpdate(): void {
  const mode = pendingFlowUpdateMode;
  if (!mode) return;
  pendingFlowUpdateMode = null;
  scheduleFlowUpdate(mode);
}

export async function refreshSchemeCheckAsync(): Promise<void> {
  const binding = getEditorBindings();
  if (!binding) return;
  const pack = usePackStore.getState().activePack;
  if (!pack) return;

  const { scheme } = binding.getScheme();
  const { flowResult } = binding.getFlow();
  const revisionAtStart = schemeFlowRevision(scheme);

  try {
    const packSlice = await pack.getSchemeSlice(scheme);
    const packData = sliceAsPackData(packSlice);
    const result = runSchemeCheck(scheme, packData, flowResult);
    if (schemeFlowRevision(binding.getScheme().scheme) !== revisionAtStart) return;
    binding.setFlow({ schemeCheckResult: result });
  } catch (err) {
    console.error('Scheme check failed:', err);
  }
}

async function runFlowCompute(mode: FlowComputeMode): Promise<void> {
  const binding = getEditorBindings();
  if (!binding) return;
  const pack = usePackStore.getState().activePack;
  if (!pack) return;

  binding.setFlow({ flowComputeState: 'computing' });
  const { scheme, activePackKey, schemesByPack, snapshot } = binding.getScheme();
  const revisionAtStart = schemeFlowRevision(scheme);
  const snap = snapshot();

  try {
    const packSlice = await pack.getSchemeSlice(scheme);
    const response = await computeFlowsAsync({
      snapshot: snap,
      scheme,
      packSlice,
      mode,
    });
    if (!response) {
      binding.setFlow({ flowComputeState: 'stale' });
      flushPendingFlowUpdate();
      return;
    }

    const currentRevision = schemeFlowRevision(binding.getScheme().scheme);
    if (!shouldApplyFlowResult(revisionAtStart, currentRevision)) {
      binding.setFlow({ flowComputeState: 'stale' });
      flushPendingFlowUpdate();
      return;
    }

    const flowResult = hydrateFlowResult(response.flowResult);

    const schemeForEdges =
      mode === 'recalculate' && response.nodes
        ? { ...scheme, nodes: response.nodes }
        : scheme;

    const flowPatch = {
      flowComputeState: 'idle' as const,
      flowResult,
      schemeCheckResult: response.schemeCheckResult,
      flowsByPack: cacheFlows(
        binding.getFlow().flowsByPack,
        activePackKey,
        schemeForEdges,
        flowResult,
      ),
    };

    if (mode === 'recalculate' && response.nodes) {
      binding.setFlow(flowPatch);
      binding.setScheme({
        scheme: schemeForEdges,
        schemesByPack: cacheScheme(schemesByPack, activePackKey, schemeForEdges),
      });
    } else {
      binding.setFlow(flowPatch);
      binding.setScheme({
        schemesByPack: cacheScheme(schemesByPack, activePackKey, scheme),
      });
    }

    flushPendingFlowUpdate();
  } catch (err) {
    console.error('Flow compute failed:', err);
    binding.setFlow({ flowComputeState: 'idle' });
    flushPendingFlowUpdate();
  }
}

function queueFlowUpdateWhileBusy(mode: FlowComputeMode): void {
  pendingFlowUpdateMode = mergePendingFlowUpdateMode(pendingFlowUpdateMode, mode);
  getEditorBindings()?.setFlow({ flowComputeState: 'stale' });
}

export function scheduleFlowUpdate(mode: FlowComputeMode): void {
  if (getEditorBindings()?.getFlow().flowComputeState === 'computing') {
    queueFlowUpdateWhileBusy(mode);
    return;
  }
  if (mode === 'recalculate') {
    debouncedFlowUpdate?.cancel();
    void runFlowCompute('recalculate');
    return;
  }
  if (!debouncedFlowUpdate) return;
  getEditorBindings()?.setFlow({ flowComputeState: 'stale' });
  debouncedFlowUpdate();
}
