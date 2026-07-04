import { useCallback, useState, type ReactNode } from 'react';
import {
  PortContextMenu,
  bufferKindsForPort,
  type PortAttachDirection,
} from '@/canvas/PortContextMenu';
import { parsePortId, nodePortFlow } from '@/canvas/ports';
import {
  PORT_ROW_HEIGHT,
  estimateHeaderHeight,
} from '@/canvas/node-bounds';
import { getRecipe } from '@/data/pack-registry';
import { isPackRuntime, type ActivePack } from '@/data/pack-runtime';
import type { Flow } from '@/data/types';
import { findAttachCandidatesFromIndex, type AttachCandidate } from '@/lib/recipe-index';
import { buildTagIndexForRecipes } from '@/lib/tag-index';
import { isBufferNode, isCustomMachineNode, isMachineNode } from '@/lib/node-kind';
import type { TfgpBufferKind, TfgpNode } from '@/schema/tfgp';
import type { TagIndex } from '@/lib/tag-index';
import type { EditorActions } from '@/editor/editor-actions';

const NODE_ATTACH_OFFSET_X = 280;

interface PortMenuState {
  x: number;
  y: number;
  anchorNodeId: string;
  anchorPort: string;
  portSide: 'in' | 'out';
  direction: PortAttachDirection;
  bufferOptions: TfgpBufferKind[];
  candidates: AttachCandidate[];
  flow: Flow;
}

function anchorPortY(
  anchor: TfgpNode,
  anchorPort: string,
  pack: ActivePack,
): number {
  const portIndex = parsePortId(anchorPort)?.index ?? 0;
  if (isBufferNode(anchor)) {
    const header = 56;
    const fields = anchor.kind === 'start_buffer' ? 88 : 36;
    return anchor.position.y + header + fields + portIndex * PORT_ROW_HEIGHT;
  }
  if (isCustomMachineNode(anchor)) {
    return anchor.position.y + 76 + portIndex * PORT_ROW_HEIGHT;
  }
  return (
    anchor.position.y +
    estimateHeaderHeight(pack, anchor.machineId, anchor.recipeId) +
    portIndex * PORT_ROW_HEIGHT
  );
}

export function usePortAttachMenu(params: {
  pack: ActivePack | null;
  schemeNodes: TfgpNode[];
  lang: 'ru' | 'en';
  tagIndex: TagIndex | null;
  attachMachine: EditorActions['attachMachine'];
  attachBuffer: EditorActions['attachBuffer'];
  attachCustomMachine: EditorActions['attachCustomMachine'];
  setSelectedNodeIds: EditorActions['setSelectedNodeIds'];
}): {
  handlePortContextMenu: (
    nodeId: string,
    portId: string,
    side: 'in' | 'out',
    clientX: number,
    clientY: number,
  ) => void;
  closePortMenu: () => void;
  menuElement: ReactNode;
} {
  const {
    pack,
    schemeNodes,
    lang,
    tagIndex,
    attachMachine,
    attachBuffer,
    attachCustomMachine,
    setSelectedNodeIds,
  } = params;

  const [portMenu, setPortMenu] = useState<PortMenuState | null>(null);

  const closePortMenu = useCallback(() => setPortMenu(null), []);

  const handlePortContextMenu = useCallback(
    (
      nodeId: string,
      portId: string,
      side: 'in' | 'out',
      clientX: number,
      clientY: number,
    ) => {
      if (!pack || !tagIndex) return;
      const node = schemeNodes.find((n) => n.id === nodeId);
      if (!node) return;

      void (async () => {
        if (isMachineNode(node)) {
          await pack.loadMachineRecipes(node.machineId);
        }
        await pack.ensureRecipeIds(
          schemeNodes.filter(isMachineNode).map((n) => n.recipeId),
        );

        const recipe = isMachineNode(node)
          ? getRecipe(pack, node.recipeId)
          : undefined;
        const flow = nodePortFlow(node, portId, recipe);
        if (!flow) return;

        const direction: PortAttachDirection = side === 'out' ? 'downstream' : 'upstream';

        if (isPackRuntime(pack)) {
          await pack.ensureRecipesForPortAttach(flow, direction, tagIndex);
        }

        const attachIndex = await pack.getFlowAttachIndex();
        const recipesById = pack.recipesByIdMap();
        const flowTagIndex = buildTagIndexForRecipes(
          pack,
          [...recipesById.values()],
          tagIndex,
        );
        const candidates = findAttachCandidatesFromIndex(
          pack,
          attachIndex,
          recipesById,
          flow,
          direction,
          lang,
          flowTagIndex,
        );

        setPortMenu({
          x: clientX,
          y: clientY,
          anchorNodeId: nodeId,
          anchorPort: portId,
          portSide: side,
          direction,
          bufferOptions: bufferKindsForPort(side),
          candidates,
          flow,
        });
      })();
    },
    [pack, tagIndex, schemeNodes, lang],
  );

  const handlePortMenuSelect = useCallback(
    (candidate: AttachCandidate) => {
      if (!portMenu) return;
      const anchor = schemeNodes.find((n) => n.id === portMenu.anchorNodeId);
      if (!anchor || !pack) return;

      const portY = anchorPortY(anchor, portMenu.anchorPort, pack);
      const position =
        portMenu.direction === 'downstream'
          ? { x: anchor.position.x + NODE_ATTACH_OFFSET_X, y: portY }
          : { x: anchor.position.x - NODE_ATTACH_OFFSET_X, y: portY };

      const newId = attachMachine({
        machineId: candidate.machineId,
        recipeId: candidate.recipeId,
        position,
        anchorNodeId: portMenu.anchorNodeId,
        anchorPort: portMenu.anchorPort,
        newPort: candidate.portId,
        direction: portMenu.direction,
        itemId: portMenu.flow.itemId,
        fluidId: portMenu.flow.fluidId,
      });
      setSelectedNodeIds([newId]);
      setPortMenu(null);
    },
    [portMenu, schemeNodes, pack, attachMachine, setSelectedNodeIds],
  );

  const handlePortBufferSelect = useCallback(
    (bufferKind: TfgpBufferKind) => {
      if (!portMenu || !pack) return;
      const anchor = schemeNodes.find((n) => n.id === portMenu.anchorNodeId);
      if (!anchor) return;

      const portY = anchorPortY(anchor, portMenu.anchorPort, pack);
      const position =
        portMenu.direction === 'downstream'
          ? { x: anchor.position.x + NODE_ATTACH_OFFSET_X, y: portY }
          : { x: anchor.position.x - NODE_ATTACH_OFFSET_X, y: portY };

      const newId = attachBuffer({
        bufferKind,
        position,
        anchorNodeId: portMenu.anchorNodeId,
        anchorPort: portMenu.anchorPort,
        direction: portMenu.direction,
        itemId: portMenu.flow.itemId,
        fluidId: portMenu.flow.fluidId,
      });
      setSelectedNodeIds([newId]);
      setPortMenu(null);
    },
    [portMenu, schemeNodes, pack, attachBuffer, setSelectedNodeIds],
  );

  const handlePortCustomMachineSelect = useCallback(() => {
    if (!portMenu || !pack) return;
    const anchor = schemeNodes.find((n) => n.id === portMenu.anchorNodeId);
    if (!anchor) return;

    const portY = anchorPortY(anchor, portMenu.anchorPort, pack);
    const position =
      portMenu.direction === 'downstream'
        ? { x: anchor.position.x + NODE_ATTACH_OFFSET_X, y: portY }
        : { x: anchor.position.x - NODE_ATTACH_OFFSET_X, y: portY };

    const newId = attachCustomMachine({
      position,
      anchorNodeId: portMenu.anchorNodeId,
      anchorPort: portMenu.anchorPort,
      direction: portMenu.direction,
      itemId: portMenu.flow.itemId,
      fluidId: portMenu.flow.fluidId,
    });
    setSelectedNodeIds([newId]);
    setPortMenu(null);
  }, [portMenu, schemeNodes, pack, attachCustomMachine, setSelectedNodeIds]);

  const menuElement =
    portMenu && pack ? (
      <PortContextMenu
        x={portMenu.x}
        y={portMenu.y}
        pack={pack}
        lang={lang}
        direction={portMenu.direction}
        portSide={portMenu.portSide}
        bufferOptions={portMenu.bufferOptions}
        candidates={portMenu.candidates}
        onSelectBuffer={handlePortBufferSelect}
        onSelectCustomMachine={handlePortCustomMachineSelect}
        onSelect={handlePortMenuSelect}
        onClose={closePortMenu}
      />
    ) : null;

  return { handlePortContextMenu, closePortMenu, menuElement };
}
