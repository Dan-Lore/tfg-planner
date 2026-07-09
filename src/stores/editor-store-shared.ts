import type { TfgpFile } from '@/schema/tfgp';
import { schemeFlowRevision } from '@/editor-graph/scheme-flow-revision';
import { dehydrateFlowResult, hydrateFlowResult } from '@/calculator';
import type { FlowResult } from '@/calculator';
import type { PersistedPackFlowCache } from '@/lib/editor-persist';
import type { EditorSnapshot } from '@/stores/editor-utils';

export function cacheScheme(
  schemesByPack: Record<string, TfgpFile>,
  key: string | null,
  scheme: TfgpFile,
): Record<string, TfgpFile> {
  if (!key) return schemesByPack;
  return { ...schemesByPack, [key]: structuredClone(scheme) };
}

export function cacheFlows(
  flowsByPack: Record<string, PersistedPackFlowCache>,
  key: string | null,
  scheme: TfgpFile,
  flowResult: FlowResult,
): Record<string, PersistedPackFlowCache> {
  if (!key) return flowsByPack;
  return {
    ...flowsByPack,
    [key]: {
      revision: schemeFlowRevision(scheme),
      flowResult: dehydrateFlowResult(flowResult) as unknown as FlowResult,
    },
  };
}

export function restoreFlowsForScheme(
  flowsByPack: Record<string, PersistedPackFlowCache>,
  key: string | null,
  scheme: TfgpFile,
): { flowResult: FlowResult | null; flowComputeState: 'idle' } {
  if (!key) {
    return { flowResult: null, flowComputeState: 'idle' };
  }
  const cached = flowsByPack[key];
  const revision = schemeFlowRevision(scheme);
  if (!cached || cached.revision !== revision) {
    return { flowResult: null, flowComputeState: 'idle' };
  }
  return {
    flowResult: hydrateFlowResult(cached.flowResult),
    flowComputeState: 'idle',
  };
}

export type SchemeStoreSlice = {
  scheme: TfgpFile;
  activePackKey: string | null;
  schemesByPack: Record<string, TfgpFile>;
  snapshot: () => EditorSnapshot;
};

export type FlowStoreSlice = {
  flowsByPack: Record<string, PersistedPackFlowCache>;
  flowResult: FlowResult | null;
  flowComputeState: 'idle' | 'computing' | 'stale';
};

export type FlowSchemePatch = Partial<{
  scheme: TfgpFile;
  schemesByPack: Record<string, TfgpFile>;
}>;

export type FlowStorePatch = Partial<{
  flowResult: FlowResult | null;
  schemeCheckResult: import('@/scheme-check/check-scheme').SchemeCheckResult | null;
  flowComputeState: 'idle' | 'computing' | 'stale';
  flowsByPack: Record<string, PersistedPackFlowCache>;
}>;

export type EditorStoreBindings = {
  getScheme: () => SchemeStoreSlice;
  setScheme: (patch: FlowSchemePatch | ((s: SchemeStoreSlice) => FlowSchemePatch)) => void;
  getFlow: () => FlowStoreSlice;
  setFlow: (patch: FlowStorePatch | ((s: FlowStoreSlice) => FlowStorePatch)) => void;
};

let bindings: EditorStoreBindings | null = null;

export function bindEditorStores(next: EditorStoreBindings): void {
  bindings = next;
}

export function getEditorBindings(): EditorStoreBindings | null {
  return bindings;
}
