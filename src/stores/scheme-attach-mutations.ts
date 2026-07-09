import type { TfgpBufferKind, TfgpCustomMachineNode, TfgpEdge, TfgpNode } from '@/schema/tfgp';
import { getRecipe } from '@/data/pack-registry';
import { estimateBufferDefaults } from '@/lib/buffer-defaults';
import {
  createEmptyCustomMachine,
  ensureCustomPortForHandle,
  portHasEdge,
} from '@/lib/custom-machine-ports';
import { isCustomMachineNode } from '@/shared/node-kind';
import { normalizeBufferNode, normalizeCustomMachineNode } from '@/lib/node-scaling';
import { normalizeNodeVoltage } from '@/lib/node-voltage';
import { inputPortId, outputPortId } from '@/shared/ports';
import { getFlowStoreState } from '@/stores/flow-store';
import { allocateEdgeId, allocateNodeId } from './editor-utils';
import { usePackStore } from './pack-store';
import { patchSchemeFields } from './scheme-store-helpers';
import type { SchemeCacheSlice } from './scheme-store-helpers';

type AttachGet = () => SchemeCacheSlice & { pushHistory: () => void };
type AttachSet = (
  partial:
    | Partial<SchemeCacheSlice>
    | ((s: SchemeCacheSlice) => Partial<SchemeCacheSlice>),
) => void;

export function createSchemeAttachMutations(get: AttachGet, set: AttachSet) {
  const updateFlows = () => getFlowStoreState().updateFlows();

  return {
    attachMachine: (params: {
      machineId: string;
      recipeId: string;
      position: { x: number; y: number };
      anchorNodeId: string;
      anchorPort: string;
      newPort: string;
      direction: 'upstream' | 'downstream';
      itemId?: string;
      fluidId?: string;
    }) => {
      get().pushHistory();
      const { scheme } = get();
      const nodeId = allocateNodeId(scheme.nodes, scheme.edges);
      const edgeId = allocateEdgeId(scheme.nodes, scheme.edges);
      const node: TfgpNode = normalizeNodeVoltage(
        {
          id: nodeId,
          machineId: params.machineId,
          recipeId: params.recipeId,
          position: params.position,
          machineCount: 1,
          overclock: 1,
          voltageTier: 'LV',
        },
        usePackStore.getState().activePack
          ? getRecipe(usePackStore.getState().activePack!, params.recipeId)
          : undefined,
      );
      const edge: TfgpEdge =
        params.direction === 'downstream'
          ? {
              id: edgeId,
              source: params.anchorNodeId,
              sourcePort: params.anchorPort,
              target: nodeId,
              targetPort: params.newPort,
              itemId: params.itemId,
              fluidId: params.fluidId,
            }
          : {
              id: edgeId,
              source: nodeId,
              sourcePort: params.newPort,
              target: params.anchorNodeId,
              targetPort: params.anchorPort,
              itemId: params.itemId,
              fluidId: params.fluidId,
            };
      set((s) =>
        patchSchemeFields(s, {
          nodes: [...s.scheme.nodes, node],
          edges: [...s.scheme.edges, edge],
        }),
      );
      updateFlows();
      return nodeId;
    },

    attachBuffer: (params: {
      bufferKind: TfgpBufferKind;
      position: { x: number; y: number };
      anchorNodeId: string;
      anchorPort: string;
      direction: 'upstream' | 'downstream';
      itemId?: string;
      fluidId?: string;
    }) => {
      get().pushHistory();
      const { scheme } = get();
      const { flowResult } = getFlowStoreState();
      const defaults = estimateBufferDefaults(
        params.anchorNodeId,
        params.anchorPort,
        params.direction,
        scheme,
        flowResult,
      );
      const nodeId = allocateNodeId(scheme.nodes, scheme.edges);
      const edgeId = allocateEdgeId(scheme.nodes, scheme.edges);

      const base = {
        id: nodeId,
        position: params.position,
        itemId: params.itemId,
        fluidId: params.fluidId,
        capacity: defaults.capacity,
      };

      let node: TfgpNode;
      if (params.bufferKind === 'start_buffer') {
        node = normalizeBufferNode({
          ...base,
          kind: 'start_buffer',
          supplyMode: 'rate',
          supplyRate: defaults.supplyRate,
          autoSupplyRate: true,
        });
      } else if (params.bufferKind === 'intermediate_buffer') {
        node = normalizeBufferNode({ ...base, kind: 'intermediate_buffer' });
      } else {
        node = normalizeBufferNode({ ...base, kind: 'end_buffer' });
      }

      const bufferOutPort = 'out_0';
      const bufferInPort = 'in_0';
      const edge: TfgpEdge =
        params.direction === 'downstream'
          ? {
              id: edgeId,
              source: params.anchorNodeId,
              sourcePort: params.anchorPort,
              target: nodeId,
              targetPort: bufferInPort,
              itemId: params.itemId,
              fluidId: params.fluidId,
            }
          : {
              id: edgeId,
              source: nodeId,
              sourcePort: bufferOutPort,
              target: params.anchorNodeId,
              targetPort: params.anchorPort,
              itemId: params.itemId,
              fluidId: params.fluidId,
            };

      set((s) =>
        patchSchemeFields(s, {
          nodes: [...s.scheme.nodes, node],
          edges: [...s.scheme.edges, edge],
        }),
      );
      updateFlows();
      return nodeId;
    },

    addCustomMachine: (position: { x: number; y: number }) => {
      get().pushHistory();
      const { scheme } = get();
      const id = allocateNodeId(scheme.nodes, scheme.edges);
      const node = normalizeCustomMachineNode(createEmptyCustomMachine(id, position));
      set((s) =>
        patchSchemeFields(s, { nodes: [...s.scheme.nodes, node] }),
      );
      updateFlows();
      return id;
    },

    addCustomPort: (nodeId: string, side: 'in' | 'out') => {
      get().pushHistory();
      set((s) => {
        const nodes = s.scheme.nodes.map((n) => {
          if (n.id !== nodeId || !isCustomMachineNode(n)) return n;
          const next =
            side === 'in'
              ? { ...n, inputs: [...n.inputs, { amount: 1 }] }
              : { ...n, outputs: [...n.outputs, { amount: 1 }] };
          return normalizeCustomMachineNode(next);
        });
        return patchSchemeFields(s, { nodes });
      });
      updateFlows();
    },

    removeCustomPort: (nodeId: string, side: 'in' | 'out', index: number) => {
      const { scheme } = get();
      const node = scheme.nodes.find((n) => n.id === nodeId);
      if (!node || !isCustomMachineNode(node)) return;
      const portId = side === 'in' ? inputPortId(index) : outputPortId(index);
      if (portHasEdge(nodeId, portId, scheme.edges)) return;

      get().pushHistory();
      set((s) => {
        const nodes = s.scheme.nodes.map((n) => {
          if (n.id !== nodeId || !isCustomMachineNode(n)) return n;
          const next =
            side === 'in'
              ? { ...n, inputs: n.inputs.filter((_, i) => i !== index) }
              : { ...n, outputs: n.outputs.filter((_, i) => i !== index) };
          return normalizeCustomMachineNode(next);
        });
        return patchSchemeFields(s, { nodes });
      });
      updateFlows();
    },

    ensureCustomPort: (
      nodeId: string,
      portId: string,
      product?: { itemId?: string; fluidId?: string },
    ) => {
      set((s) => {
        const nodes = s.scheme.nodes.map((n) => {
          if (n.id !== nodeId || !isCustomMachineNode(n)) return n;
          return normalizeCustomMachineNode(
            ensureCustomPortForHandle(n, portId, product),
          );
        });
        return patchSchemeFields(s, { nodes });
      });
    },

    attachCustomMachine: (params: {
      position: { x: number; y: number };
      anchorNodeId: string;
      anchorPort: string;
      direction: 'upstream' | 'downstream';
      itemId?: string;
      fluidId?: string;
    }) => {
      get().pushHistory();
      const { scheme } = get();
      const nodeId = allocateNodeId(scheme.nodes, scheme.edges);
      const edgeId = allocateEdgeId(scheme.nodes, scheme.edges);
      const product = { itemId: params.itemId, fluidId: params.fluidId };
      const inPort = inputPortId(0);
      const outPort = outputPortId(0);

      let node: TfgpCustomMachineNode = normalizeCustomMachineNode(
        createEmptyCustomMachine(nodeId, params.position),
      );
      if (params.direction === 'downstream') {
        node = normalizeCustomMachineNode(
          ensureCustomPortForHandle(
            { ...node, inputs: [{ amount: 1, ...product }] },
            inPort,
            product,
          ),
        );
      } else {
        node = normalizeCustomMachineNode(
          ensureCustomPortForHandle(
            { ...node, outputs: [{ amount: 1, ...product }] },
            outPort,
            product,
          ),
        );
      }

      const edge: TfgpEdge =
        params.direction === 'downstream'
          ? {
              id: edgeId,
              source: params.anchorNodeId,
              sourcePort: params.anchorPort,
              target: nodeId,
              targetPort: inPort,
              itemId: params.itemId,
              fluidId: params.fluidId,
            }
          : {
              id: edgeId,
              source: nodeId,
              sourcePort: outPort,
              target: params.anchorNodeId,
              targetPort: params.anchorPort,
              itemId: params.itemId,
              fluidId: params.fluidId,
            };

      set((s) =>
        patchSchemeFields(s, {
          nodes: [...s.scheme.nodes, node],
          edges: [...s.scheme.edges, edge],
        }),
      );
      updateFlows();
      return nodeId;
    },
  };
}
