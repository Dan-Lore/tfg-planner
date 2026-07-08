import { Link } from 'react-router-dom';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
} from 'react';
import {
  type Connection,
  type Edge,
  type Node,
  type OnEdgesDelete,
  type OnNodesDelete,
  type OnSelectionChangeParams,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import { usePackStore } from '@/stores/pack-store';
import { usePackLangReady } from '@/hooks/usePackLangReady';
import { isPackRuntime } from '@/data/pack-runtime';
import { useEditorStore } from '@/stores/editor-store';
import { useThemeStore } from '@/stores/theme-store';
import { useNodeTypes } from '@/canvas/MachineNode';
import { EditorCanvas, type EditorCanvasHandle } from '@/canvas/EditorCanvas';
import { FlowEdge } from '@/canvas/FlowEdge';
import { NodeDisplayProvider } from '@/canvas/node-display-context';
import { EditorNodeActionsProvider } from '@/canvas/editor-node-actions-context';
import { nodePortFlow, portsMatch } from '@/canvas/ports';
import { getRecipe } from '@/data/pack-registry';
import { buildTagIndexFromMeta } from '@/lib/tag-index';
import { pickTfgpFile, readTfgpFile } from '@/lib/read-tfgp-file';
import { preloadSchemeRecipes } from '@/lib/preload-scheme-recipes';
import { isEntryAlignedWithEditor } from '@/lib/pack-selection';
import { isCustomMachineNode, isMachineNode } from '@/lib/node-kind';
import { useEditorActions } from '@/editor/editor-actions';
import { EditorToolbar } from '@/editor/EditorToolbar';
import { EditorSidebar } from '@/editor/EditorSidebar';
import { usePortAttachMenu } from '@/editor/PortAttachMenu';
import { useEditorRfGraph } from '@/hooks/useEditorRfGraph';
import { useEditorSelection } from '@/hooks/useEditorSelection';
import { useSchemeIssues } from '@/hooks/useSchemeIssues';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { shouldWarnVersionMismatch } from '@/lib/version-mismatch';
import { idsEqual } from '@/lib/id-array-equal';
import type { TfgpFile } from '@/schema/tfgp';

function useEdgeTypes() {
  return useMemo(() => ({ flow: FlowEdge }), []);
}

export function EditorPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'en' ? 'en' : 'ru';
  const canvasRef = useRef<EditorCanvasHandle>(null);
  const pack = usePackStore((s) => s.activePack);
  const activeEntry = usePackStore((s) => s.activeEntry);
  const packError = usePackStore((s) => s.error);
  const {
    scheme,
    flowResult,
    schemeCheckResult,
    selectedNodeIds,
    selectedEdgeIds,
    activePackKey,
    flowComputeState,
  } = useEditorStore(
    useShallow((s) => ({
      scheme: s.scheme,
      flowResult: s.flowResult,
      schemeCheckResult: s.schemeCheckResult,
      selectedNodeIds: s.selectedNodeIds,
      selectedEdgeIds: s.selectedEdgeIds,
      activePackKey: s.activePackKey,
      flowComputeState: s.flowComputeState,
    })),
  );
  const editorActions = useEditorActions();
  const {
    setNodes,
    setViewport,
    updateNode,
    removeNodes,
    removeEdges,
    addEdge: addEdgeToStore,
    attachMachine,
    attachBuffer,
    attachCustomMachine,
    addCustomPort,
    removeCustomPort,
    ensureCustomPort,
    pushHistory,
    loadScheme,
    setSchemeName,
    setSelectedNodeIds,
    setSelectedEdgeIds,
    updateFlows,
    refreshFlowDisplay,
    refreshSchemeCheck,
    setEdgeConstraint,
    clearEdgeConstraint,
  } = editorActions;

  const { focusSelection } = useEditorSelection({
    canvasRef,
    setSelectedNodeIds,
    setSelectedEdgeIds,
  });

  const getViewportCenterForPlacement = useCallback(
    () => canvasRef.current?.getViewportCenterFlowPosition() ?? null,
    [],
  );

  const [pendingImport, setPendingImport] = useState<TfgpFile | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const [packDisplayEpoch, setPackDisplayEpoch] = useState(0);
  const langReady = usePackLangReady(pack);
  const colorTheme = useThemeStore((s) => s.theme);
  const canvasDragDepthRef = useRef(0);
  const suppressSelectionSyncRemainingRef = useRef(0);
  const [isCanvasDragOver, setIsCanvasDragOver] = useState(false);
  const [boxSelectWrapClass, setBoxSelectWrapClass] = useState('');

  const suppressSelectionSync = useCallback(() => {
    suppressSelectionSyncRemainingRef.current = 4;
  }, []);

  const nodeTypes = useNodeTypes();
  const edgeTypes = useEdgeTypes();

  const tagIndex = useMemo(
    () => (pack ? buildTagIndexFromMeta(pack) : null),
    [pack],
  );

  const packSelectionAligned = isEntryAlignedWithEditor(activeEntry, activePackKey);
  const canDeferPackLoad = packSelectionAligned && scheme.nodes.length > 0;

  useEffect(() => {
    if (!pack) return;
    let cancelled = false;
    void (async () => {
      const { scheme, flowResult } = useEditorStore.getState();
      await preloadSchemeRecipes(pack, scheme);
      if (cancelled) return;
      refreshFlowDisplay();
      if (flowResult) {
        refreshSchemeCheck();
      } else if (scheme.nodes.length > 0) {
        updateFlows();
      }
      setPackDisplayEpoch((epoch) => epoch + 1);
    })();
    return () => {
      cancelled = true;
    };
  }, [pack, updateFlows, refreshFlowDisplay, refreshSchemeCheck]);

  useEffect(() => {
    if (!pack || !isPackRuntime(pack)) return;
    if (!langReady) return;
    setPackDisplayEpoch((epoch) => epoch + 1);
  }, [langReady]);

  const handleRecipeChange = useCallback(
    (nodeId: string, recipeId: string) => {
      updateNode(nodeId, { recipeId });
    },
    [updateNode],
  );

  const { handlePortContextMenu, closePortMenu, menuElement } = usePortAttachMenu({
    pack,
    schemeNodes: scheme.nodes,
    lang,
    tagIndex,
    attachMachine,
    attachBuffer,
    attachCustomMachine,
    focusSelection,
  });

  const {
    connectedPorts,
    layoutWidthByNodeId,
    flowEdgeData,
    nodeDisplayById,
    editorNodeActions,
    rfNodes,
    rfEdges,
  } = useEditorRfGraph({
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
  });

  const { handleFocusIssue, handlePanToIssue } = useSchemeIssues({
    schemeNodes: scheme.nodes,
    schemeEdges: scheme.edges,
    pack,
    layoutWidthByNodeId,
    nodeDisplayById,
    canvasRef,
    focusSelection,
    suppressSelectionSync,
  });

  const onPersistNodePositions = useCallback(
    (current: Node[]) => {
      pushHistory();
      const schemeNodes = useEditorStore.getState().scheme.nodes;
      setNodes(
        schemeNodes.map((n) => {
          const rf = current.find((u) => u.id === n.id);
          return rf ? { ...n, position: rf.position } : n;
        }),
      );
    },
    [setNodes, pushHistory],
  );

  const isValidConnection = useCallback(
    (conn: Connection | Edge) => {
      if (!pack || !conn.source || !conn.target) return false;
      if (!conn.sourceHandle?.startsWith('out_')) return false;
      if (!conn.targetHandle?.startsWith('in_')) return false;
      const srcNode = scheme.nodes.find((n) => n.id === conn.source);
      const tgtNode = scheme.nodes.find((n) => n.id === conn.target);
      if (!srcNode || !tgtNode) return false;
      const srcRecipe =
        pack && isMachineNode(srcNode) ? getRecipe(pack, srcNode.recipeId) : undefined;
      const tgtRecipe =
        pack && isMachineNode(tgtNode) ? getRecipe(pack, tgtNode.recipeId) : undefined;
      const srcFlow = nodePortFlow(srcNode, conn.sourceHandle, srcRecipe);
      const tgtFlow = nodePortFlow(tgtNode, conn.targetHandle, tgtRecipe);
      if (srcFlow && !tgtFlow && isCustomMachineNode(tgtNode)) return true;
      if (!srcFlow && tgtFlow && isCustomMachineNode(srcNode)) return true;
      return portsMatch(srcFlow, tgtFlow, tagIndex ?? undefined);
    },
    [pack, scheme.nodes, tagIndex],
  );

  const onConnect = useCallback(
    (conn: Connection) => {
      if (!conn.source || !conn.target || !conn.sourceHandle || !conn.targetHandle) {
        return;
      }
      if (!isValidConnection(conn)) return;
      const srcNode = scheme.nodes.find((n) => n.id === conn.source);
      const tgtNode = scheme.nodes.find((n) => n.id === conn.target);
      if (!srcNode || !tgtNode) return;

      const srcRecipe =
        pack && isMachineNode(srcNode) ? getRecipe(pack, srcNode.recipeId) : undefined;
      const tgtRecipe =
        pack && isMachineNode(tgtNode) ? getRecipe(pack, tgtNode.recipeId) : undefined;
      let srcFlow = nodePortFlow(srcNode, conn.sourceHandle, srcRecipe);
      let tgtFlow = nodePortFlow(tgtNode, conn.targetHandle, tgtRecipe);

      if (isCustomMachineNode(tgtNode) && srcFlow) {
        ensureCustomPort(tgtNode.id, conn.targetHandle, {
          itemId: srcFlow.itemId,
          fluidId: srcFlow.fluidId,
        });
        tgtFlow = srcFlow;
      }
      if (isCustomMachineNode(srcNode) && tgtFlow) {
        ensureCustomPort(srcNode.id, conn.sourceHandle, {
          itemId: tgtFlow.itemId,
          fluidId: tgtFlow.fluidId,
        });
        srcFlow = tgtFlow;
      }
      if (!srcFlow) return;

      addEdgeToStore({
        source: conn.source,
        target: conn.target,
        sourcePort: conn.sourceHandle,
        targetPort: conn.targetHandle,
        itemId: srcFlow.itemId,
        fluidId: srcFlow.fluidId,
      });
    },
    [pack, scheme.nodes, addEdgeToStore, isValidConnection, ensureCustomPort],
  );

  const onSelectionChange = useCallback(
    ({ nodes, edges }: OnSelectionChangeParams) => {
      if (suppressSelectionSyncRemainingRef.current > 0) {
        suppressSelectionSyncRemainingRef.current -= 1;
        return;
      }
      const nodeIds = nodes.map((n) => n.id);
      const edgeIds = edges.map((e) => e.id);
      const { selectedNodeIds, selectedEdgeIds } = useEditorStore.getState();
      const nodeChanged = !idsEqual(selectedNodeIds, nodeIds);
      const edgeChanged = !idsEqual(selectedEdgeIds, edgeIds);
      if (nodeChanged) {
        setSelectedNodeIds(nodeIds);
      }
      if (edgeChanged) {
        setSelectedEdgeIds(edgeIds);
      }
    },
    [setSelectedNodeIds, setSelectedEdgeIds],
  );

  const onNodesDelete = useCallback<OnNodesDelete>(
    (nodes) => {
      removeNodes(nodes.map((n) => n.id));
    },
    [removeNodes],
  );

  const onEdgesDelete = useCallback<OnEdgesDelete>(
    (edges) => {
      removeEdges(edges.map((e) => e.id));
    },
    [removeEdges],
  );

  const importTfgpFile = useCallback(
    async (file: File) => {
      try {
        const parsed = await readTfgpFile(file);
        setImportError(null);
        if (
          shouldWarnVersionMismatch(
            parsed.modpack.version,
            parsed.modpack.dataVersion,
            activeEntry,
          )
        ) {
          setPendingImport(parsed);
          return;
        }
        loadScheme(parsed);
      } catch (err) {
        setImportError(err instanceof Error ? err.message : t('editor.importFailed'));
      }
    },
    [activeEntry, loadScheme, t],
  );

  const hasFileDrag = (e: DragEvent) => e.dataTransfer.types.includes('Files');

  const handleCanvasDragEnter = (e: DragEvent<HTMLDivElement>) => {
    if (!hasFileDrag(e)) return;
    e.preventDefault();
    canvasDragDepthRef.current += 1;
    setIsCanvasDragOver(true);
  };

  const handleCanvasDragOver = (e: DragEvent<HTMLDivElement>) => {
    if (!hasFileDrag(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  const handleCanvasDragLeave = (e: DragEvent<HTMLDivElement>) => {
    if (!hasFileDrag(e)) return;
    e.preventDefault();
    canvasDragDepthRef.current -= 1;
    if (canvasDragDepthRef.current <= 0) {
      canvasDragDepthRef.current = 0;
      setIsCanvasDragOver(false);
    }
  };

  const handleCanvasDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    canvasDragDepthRef.current = 0;
    setIsCanvasDragOver(false);
    const file = pickTfgpFile(e.dataTransfer.files);
    if (!file) return;
    void importTfgpFile(file);
  };

  if (!pack && !canDeferPackLoad) {
    if (activeEntry && packError) {
      return (
        <div className="editor-page editor-page--empty">
          <div className="alert editor-empty-alert">
            <p>{packError}</p>
            <Link to="/" className="btn">
              {t('editor.selectPackOnHome')}
            </Link>
          </div>
        </div>
      );
    }
    if (activeEntry && !packSelectionAligned) {
      return (
        <div className="editor-page editor-page--empty">
          <div className="alert editor-empty-alert">
            <p>{t('editor.noPack')}</p>
            <Link to="/" className="btn">
              {t('editor.selectPackOnHome')}
            </Link>
          </div>
        </div>
      );
    }
    if (activeEntry) {
      return (
        <div className="editor-page editor-page--empty">
          <div className="alert editor-empty-alert">
            <p>{t('editor.restoringPack', { version: activeEntry.modpackVersion })}</p>
          </div>
        </div>
      );
    }
    return (
      <div className="editor-page editor-page--empty">
        <div className="alert editor-empty-alert">
          <p>{t('editor.noPack')}</p>
          <Link to="/" className="btn">
            {t('editor.selectPackOnHome')}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="editor-page">
      {importError && (
        <div className="alert editor-import-error" role="alert">
          <p>{importError}</p>
          <button type="button" className="btn btn-secondary" onClick={() => setImportError(null)}>
            {t('dialog.dismiss')}
          </button>
        </div>
      )}
      <EditorToolbar
        activeEntry={activeEntry}
        pack={pack}
        scheme={scheme}
        selectedNodeIds={selectedNodeIds}
        flowComputeState={flowComputeState}
        addNode={editorActions.addNode}
        addCustomMachine={editorActions.addCustomMachine}
        duplicateSelected={editorActions.duplicateSelected}
        copySelection={editorActions.copySelection}
        pasteClipboard={editorActions.pasteClipboard}
        undo={editorActions.undo}
        redo={editorActions.redo}
        clearScheme={editorActions.clearScheme}
        focusSelection={focusSelection}
        getViewportCenterForPlacement={getViewportCenterForPlacement}
        onImportFile={importTfgpFile}
      />
      <div className="editor-body">
        <div
          className={`editor-canvas-wrap${isCanvasDragOver ? ' editor-canvas-wrap--drop-target' : ''}${boxSelectWrapClass ? ` ${boxSelectWrapClass}` : ''}`}
          onDragEnter={handleCanvasDragEnter}
          onDragOver={handleCanvasDragOver}
          onDragLeave={handleCanvasDragLeave}
          onDrop={handleCanvasDrop}
        >
          {isCanvasDragOver && (
            <div className="editor-canvas-drop-overlay" aria-hidden="true">
              {t('editor.dropScheme')}
            </div>
          )}
          {flowResult?.nonConverged && (
            <div className="editor-canvas-notice editor-canvas-notice--warning" role="alert">
              {t('editor.flowNonConverged')}
            </div>
          )}
          {!pack && activeEntry && canDeferPackLoad && (
            <div className="editor-canvas-notice" role="status" aria-live="polite">
              {t('editor.restoringPack', { version: activeEntry.modpackVersion })}
              <span className="editor-canvas-notice__dots" aria-hidden="true">
                <span>.</span>
                <span>.</span>
                <span>.</span>
              </span>
            </div>
          )}
          <EditorNodeActionsProvider value={editorNodeActions}>
            <NodeDisplayProvider value={nodeDisplayById}>
              <EditorCanvas
                ref={canvasRef}
                rfNodes={rfNodes}
                rfEdges={rfEdges}
                selectedNodeIds={selectedNodeIds}
                selectedEdgeIds={selectedEdgeIds}
                nodeTypes={nodeTypes}
                edgeTypes={edgeTypes}
                colorTheme={colorTheme}
                viewport={scheme.viewport}
                pack={pack}
                schemeNodes={scheme.nodes}
                layoutWidthByNodeId={layoutWidthByNodeId}
                nodeDisplayById={nodeDisplayById}
                onPersistNodePositions={onPersistNodePositions}
                onConnect={onConnect}
                isValidConnection={isValidConnection}
                onSelectionChange={onSelectionChange}
                onNodesDelete={onNodesDelete}
                onEdgesDelete={onEdgesDelete}
                onPaneClick={() => {
                  closePortMenu();
                  canvasRef.current?.clearEdgeFocus();
                }}
                onNodeClick={closePortMenu}
                onMoveEnd={(vp) => setViewport(vp)}
                onBoxSelectWrapClassChange={setBoxSelectWrapClass}
              />
            </NodeDisplayProvider>
          </EditorNodeActionsProvider>
        </div>
        <EditorSidebar
          scheme={scheme}
          pack={pack}
          lang={lang}
          flowResult={flowResult}
          flowEdgeData={flowEdgeData}
          schemeCheckResult={schemeCheckResult}
          selectedNodeIds={selectedNodeIds}
          selectedEdgeIds={selectedEdgeIds}
          connectedInByNode={connectedPorts.inPorts}
          connectedOutByNode={connectedPorts.outPorts}
          setSchemeName={setSchemeName}
          updateNode={updateNode}
          addCustomPort={addCustomPort}
          removeCustomPort={removeCustomPort}
          onFocusIssue={handleFocusIssue}
          onPanToIssue={handlePanToIssue}
          edgeConstraints={scheme.edgeConstraints}
          setEdgeConstraint={setEdgeConstraint}
          clearEdgeConstraint={clearEdgeConstraint}
        />
      </div>
      {pendingImport && activeEntry && (
        <ConfirmDialog
          open
          title={t('editor.versionMismatch.title')}
          message={t('editor.versionMismatch.importMessage', {
            fileVersion: pendingImport.modpack.version,
            activeVersion: activeEntry.modpackVersion,
          })}
          confirmLabel={t('editor.versionMismatch.confirm')}
          cancelLabel={t('dialog.cancel')}
          onConfirm={() => {
            loadScheme(pendingImport);
            setPendingImport(null);
          }}
          onCancel={() => setPendingImport(null)}
        />
      )}
      {menuElement}
    </div>
  );
}
