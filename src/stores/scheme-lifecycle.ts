import { createEmptyTfgp } from '@/schema/tfgp';
import type { TfgpFile } from '@/schema/tfgp';
import { packKey } from '@/data/pack-key';
import {
  dedupeSchemeTopology,
  normalizeSchemeNodes,
  seedIdCounter,
} from './editor-utils';
import { cacheScheme } from '@/stores/editor-store-shared';
import { usePackStore } from './pack-store';
import { getFlowStoreState } from '@/stores/flow-store';
import { refreshSchemeCheckAsync } from '@/stores/flow-compute-runtime';
import type { SchemeCacheSlice } from './scheme-store-helpers';

type LifecycleGet = () => SchemeCacheSlice;
type LifecycleSet = (
  partial:
    | Partial<SchemeCacheSlice & {
        past: [];
        future: [];
        selectedNodeIds: [];
        selectedEdgeIds: [];
      }>
    | ((
        s: SchemeCacheSlice & {
          past: [];
          future: [];
          selectedNodeIds: string[];
          selectedEdgeIds: string[];
        },
      ) => Partial<SchemeCacheSlice>),
) => void;

export function createSchemeLifecycleActions(get: LifecycleGet, set: LifecycleSet) {
  return {
    switchToPack: (modpackVersion: string, dataVersion: number) => {
      const { scheme, activePackKey, schemesByPack } = get();
      const updatedCache = cacheScheme(schemesByPack, activePackKey, scheme);
      const newKey = packKey(modpackVersion, dataVersion);
      const cached = updatedCache[newKey];
      const pack = usePackStore.getState().activePack;
      const nextScheme = cached
        ? { ...cached, nodes: normalizeSchemeNodes(cached.nodes, pack) }
        : createEmptyTfgp(modpackVersion, dataVersion);
      seedIdCounter(nextScheme.nodes, nextScheme.edges);

      const flowStore = getFlowStoreState();
      flowStore.restoreForPack(newKey, nextScheme);

      set({
        schemesByPack: updatedCache,
        activePackKey: newKey,
        scheme: nextScheme,
        past: [],
        future: [],
        selectedNodeIds: [],
        selectedEdgeIds: [],
      } as never);

      const { flowResult } = getFlowStoreState();
      if (!flowResult) {
        getFlowStoreState().updateFlows();
      } else {
        void refreshSchemeCheckAsync();
      }
    },

    loadScheme: (file: TfgpFile) => {
      const pack = usePackStore.getState().activePack;
      const normalizedNodes = normalizeSchemeNodes(file.nodes, pack);
      const deduped = dedupeSchemeTopology(normalizedNodes, file.edges);
      const { nodes, edges } = deduped;
      const normalized = {
        ...file,
        nodes,
        edges,
        edgeConstraints: file.edgeConstraints ?? [],
      };
      seedIdCounter(normalized.nodes, normalized.edges);
      const key = packKey(normalized.modpack.version, normalized.modpack.dataVersion);
      getFlowStoreState().clearFlowState();
      set((s) => ({
        scheme: normalized,
        activePackKey: key,
        schemesByPack: cacheScheme(s.schemesByPack, key, normalized),
        past: [],
        future: [],
        selectedNodeIds: [],
        selectedEdgeIds: [],
      }));
      getFlowStoreState().updateFlows();
    },

    clearScheme: () => {
      const { scheme, activePackKey, schemesByPack } = get();
      const cleared = createEmptyTfgp(
        scheme.modpack.version,
        scheme.modpack.dataVersion,
      );
      seedIdCounter(cleared.nodes, cleared.edges);
      getFlowStoreState().clearFlowState();
      set({
        scheme: cleared,
        schemesByPack: cacheScheme(schemesByPack, activePackKey, cleared),
        past: [],
        future: [],
        selectedNodeIds: [],
        selectedEdgeIds: [],
      } as never);
    },

    setSchemeName: (name: string) => {
      set((s) => {
        const scheme = {
          ...s.scheme,
          meta: { ...s.scheme.meta, name },
        };
        return {
          scheme,
          schemesByPack: cacheScheme(s.schemesByPack, s.activePackKey, scheme),
        };
      });
    },
  };
}
