import type {
  TfgpEdge,
  TfgpFile,
  TfgpMachineNode,
  TfgpNode,
} from '@/schema/tfgp';
import { defaultVoltageTierForRecipe } from '@/calculator';
import { getRecipe } from '@/data/pack-registry';
import { pruneInvalidEdges } from '@/editor-graph/prune-edges';
import { clampNonNegativeInt } from '@/lib/buffer-defaults';
import { clampMachineCount } from '@/lib/machine-count';
import { isBufferNode, isCustomMachineNode, isMachineNode } from '@/shared/node-kind';
import { normalizeBufferNode, normalizeCustomMachineNode } from '@/lib/node-scaling';
import { normalizeNodeVoltage, patchForRecipeChange } from '@/lib/node-voltage';
import { getFlowStoreState } from '@/stores/flow-store';
import {
  allocateEdgeId,
  allocateNodeId,
} from './editor-utils';
import { usePackStore } from './pack-store';
import { patchSchemeFields } from './scheme-store-helpers';
import type { SchemeCacheSlice } from './scheme-store-helpers';

type MutationsGet = () =>
  SchemeCacheSlice & {
    selectedNodeIds: string[];
    selectedEdgeIds: string[];
    pushHistory: () => void;
    removeEdges: (ids: string[]) => void;
  };
type MutationsSet = (
  partial:
    | Partial<
        SchemeCacheSlice & {
          selectedNodeIds: string[];
          selectedEdgeIds: string[];
        }
      >
    | ((
        s: SchemeCacheSlice & {
          selectedNodeIds: string[];
          selectedEdgeIds: string[];
        },
      ) => Partial<
        SchemeCacheSlice & {
          selectedNodeIds: string[];
          selectedEdgeIds: string[];
        }
      >),
) => void;

export function createSchemeMutations(get: MutationsGet, set: MutationsSet) {
  const updateFlows = () => getFlowStoreState().updateFlows();

  return {
    setNodes: (nodes: TfgpNode[]) => {
      set((s) => patchSchemeFields(s, { nodes }));
    },

    setEdges: (edges: TfgpEdge[]) => {
      set((s) => patchSchemeFields(s, { edges }));
    },

    setViewport: (viewport: TfgpFile['viewport']) => {
      set((s) => patchSchemeFields(s, { viewport }));
    },

    addNode: (partial: Omit<TfgpMachineNode, 'id'>) => {
      get().pushHistory();
      const { scheme } = get();
      const pack = usePackStore.getState().activePack;
      const recipe = pack ? getRecipe(pack, partial.recipeId) : undefined;
      const id = allocateNodeId(scheme.nodes, scheme.edges);
      const node: TfgpMachineNode = normalizeNodeVoltage(
        {
          ...partial,
          id,
          machineCount: partial.machineCount ?? 1,
          overclock: partial.overclock ?? 1,
          voltageTier:
            partial.voltageTier ??
            (recipe ? defaultVoltageTierForRecipe(recipe) : 'LV'),
        },
        recipe,
      );
      set((s) =>
        patchSchemeFields(s, { nodes: [...s.scheme.nodes, node] }),
      );
      updateFlows();
      return id;
    },

    updateNode: (id: string, patch: Partial<TfgpNode>) => {
      get().pushHistory();
      set((s) => {
        const pack = usePackStore.getState().activePack;
        let scheme = {
          ...s.scheme,
          nodes: s.scheme.nodes.map((n) => {
            if (n.id !== id) return n;
            if (isBufferNode(n)) {
              let next = { ...n, ...patch } as typeof n;
              if ('capacity' in patch && patch.capacity != null) {
                next = { ...next, capacity: clampNonNegativeInt(patch.capacity) };
              }
              if (next.kind === 'start_buffer') {
                if ('supplyRate' in patch && patch.supplyRate != null) {
                  next = {
                    ...next,
                    supplyRate: clampNonNegativeInt(patch.supplyRate),
                    autoSupplyRate: false,
                  };
                }
                if ('initialStock' in patch && patch.initialStock != null) {
                  next = {
                    ...next,
                    initialStock: clampNonNegativeInt(patch.initialStock),
                  };
                }
              }
              return normalizeBufferNode(next);
            }
            if (isCustomMachineNode(n)) {
              return normalizeCustomMachineNode({ ...n, ...patch } as typeof n);
            }
            if (!isMachineNode(n)) return n;
            let next: TfgpMachineNode = { ...n, ...(patch as Partial<TfgpMachineNode>) };
            if ('machineCount' in patch && patch.machineCount != null) {
              next = { ...next, machineCount: clampMachineCount(patch.machineCount) };
            }
            if ('recipeId' in patch && patch.recipeId && pack) {
              const recipe = getRecipe(pack, patch.recipeId);
              next = { ...next, ...patchForRecipeChange(recipe, n) };
            } else if (
              ('voltageTier' in patch && patch.voltageTier) ||
              !('recipeId' in patch)
            ) {
              const recipe = pack ? getRecipe(pack, next.recipeId) : undefined;
              next = normalizeNodeVoltage(next, recipe);
            }
            return next;
          }),
        };
        if ('recipeId' in patch && patch.recipeId) {
          const activePack = usePackStore.getState().activePack;
          if (activePack) {
            scheme = {
              ...scheme,
              edges: pruneInvalidEdges(scheme.edges, scheme.nodes, activePack),
            };
          }
        }
        return patchSchemeFields(s, { nodes: scheme.nodes, edges: scheme.edges });
      });
      updateFlows();
    },

    removeNodes: (ids: string[]) => {
      get().pushHistory();
      const idSet = new Set(ids);
      set((s) => {
        const scheme = {
          ...s.scheme,
          nodes: s.scheme.nodes.filter((n) => !idSet.has(n.id)),
          edges: s.scheme.edges.filter(
            (e) => !idSet.has(e.source) && !idSet.has(e.target),
          ),
        };
        return {
          ...patchSchemeFields(s, { nodes: scheme.nodes, edges: scheme.edges }),
          selectedNodeIds: s.selectedNodeIds.filter((nid) => !idSet.has(nid)),
          selectedEdgeIds: s.selectedEdgeIds.filter((eid) =>
            scheme.edges.some((e) => e.id === eid),
          ),
        };
      });
      updateFlows();
    },

    addEdge: (partial: Omit<TfgpEdge, 'id'>) => {
      get().pushHistory();
      const { scheme } = get();
      const edge: TfgpEdge = {
        id: allocateEdgeId(scheme.nodes, scheme.edges),
        ...partial,
      };
      set((s) =>
        patchSchemeFields(s, { edges: [...s.scheme.edges, edge] }),
      );
      updateFlows();
    },

    removeEdge: (id: string) => {
      get().removeEdges([id]);
    },

    removeEdges: (ids: string[]) => {
      if (ids.length === 0) return;
      get().pushHistory();
      const idSet = new Set(ids);
      set((s) => {
        const edges = s.scheme.edges.filter((e) => !idSet.has(e.id));
        const edgeConstraints = (s.scheme.edgeConstraints ?? []).filter(
          (c) => !idSet.has(c.edgeId),
        );
        return {
          ...patchSchemeFields(s, { edges, edgeConstraints }),
          selectedEdgeIds: s.selectedEdgeIds.filter((eid) => !idSet.has(eid)),
        };
      });
      updateFlows();
    },
  };
}
