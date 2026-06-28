import type { FlowResult } from '@/calculator/flow-solver';
import { checkScheme, type SchemeCheckResult } from '@/scheme-check/check-scheme';
import { sliceAsPackData } from '@/data/pack-slice';
import type { PackSlice } from '@/data/types';
import { runSolver, type EditorSnapshot } from '@/stores/editor-utils';
import type { TfgpFile } from '@/schema/tfgp';

export type FlowComputeMode = 'update' | 'recalculate';

export interface FlowWorkerRequest {
  id: number;
  snapshot: EditorSnapshot;
  scheme: TfgpFile;
  packSlice: PackSlice;
  mode: FlowComputeMode;
}

export interface FlowWorkerResponse {
  id: number;
  flowResult: FlowResult;
  schemeCheckResult: SchemeCheckResult;
  nodes?: TfgpFile['nodes'];
}

self.onmessage = (event: MessageEvent<FlowWorkerRequest>) => {
  const { id, snapshot, scheme, packSlice, mode } = event.data;
  const pack = sliceAsPackData(packSlice);
  const preserveManual = mode === 'update';
  const flowResult = runSolver(snapshot, pack, {
    preserveManualMachineCounts: preserveManual,
  });
  const schemeCheckResult = checkScheme(scheme, pack, { flowResult });

  const response: FlowWorkerResponse = {
    id,
    flowResult,
    schemeCheckResult,
  };

  if (mode === 'recalculate') {
    response.nodes = snapshot.nodes.map((n) => {
      if (n.kind && n.kind !== 'machine') return n;
      if (!('machineId' in n)) return n;
      return {
        ...n,
        machineCount: flowResult.nodeMachineCounts[n.id] ?? n.machineCount,
      };
    });
  }

  self.postMessage(response);
};

export default {} as typeof Worker & { new (): Worker };
