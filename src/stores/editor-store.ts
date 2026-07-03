import type { StoreApi } from 'zustand';
import { useStore } from 'zustand';
import { bindEditorStores } from '@/stores/editor-store-shared';
import { initFlowComputeRuntime } from '@/stores/flow-compute-runtime';
import { editorStoresHaveHydrated } from '@/stores/editor-hydration';
import { useSchemeStore, type SchemeState } from '@/stores/scheme-store';
import { useFlowStore, type FlowState, type FlowComputeState } from '@/stores/flow-store';

export type { FlowComputeState };

export type EditorState = SchemeState & FlowState;

function getEditorState(): EditorState {
  return {
    ...useSchemeStore.getState(),
    ...useFlowStore.getState(),
  };
}

function subscribeEditor(
  listener: (state: EditorState, prevState: EditorState) => void,
): () => void {
  const wrap = () => listener(getEditorState(), getEditorState());
  const unsubScheme = useSchemeStore.subscribe(wrap);
  const unsubFlow = useFlowStore.subscribe(wrap);
  return () => {
    unsubScheme();
    unsubFlow();
  };
}

function setEditorState(
  partial:
    | Partial<EditorState>
    | ((state: EditorState) => Partial<EditorState>),
): void {
  const current = getEditorState();
  const patch = typeof partial === 'function' ? partial(current) : partial;

  const schemeKeys = new Set(Object.keys(useSchemeStore.getState()));
  const flowKeys = new Set(Object.keys(useFlowStore.getState()));

  const schemePatch: Partial<SchemeState> = {};
  const flowPatch: Partial<FlowState> = {};

  for (const [key, value] of Object.entries(patch)) {
    if (schemeKeys.has(key)) {
      (schemePatch as Record<string, unknown>)[key] = value;
    }
    if (flowKeys.has(key)) {
      (flowPatch as Record<string, unknown>)[key] = value;
    }
  }

  if (Object.keys(schemePatch).length > 0) {
    useSchemeStore.setState(schemePatch as Partial<SchemeState>);
  }
  if (Object.keys(flowPatch).length > 0) {
    useFlowStore.setState(flowPatch as Partial<FlowState>);
  }
}

const editorStoreApi: StoreApi<EditorState> = {
  getState: getEditorState,
  getInitialState: getEditorState,
  setState: setEditorState,
  subscribe: subscribeEditor,
};

type UseEditorStore = {
  (): EditorState;
  <T>(selector: (state: EditorState) => T): T;
  getState: typeof getEditorState;
  setState: typeof setEditorState;
  subscribe: typeof subscribeEditor;
  persist: typeof useSchemeStore.persist;
  hasHydrated: typeof editorStoresHaveHydrated;
};

export const useEditorStore = ((selector?: (state: EditorState) => unknown) =>
  selector
    ? useStore(editorStoreApi, selector as (state: EditorState) => unknown)
    : useStore(editorStoreApi)) as UseEditorStore;

useEditorStore.getState = getEditorState;
useEditorStore.setState = setEditorState;
useEditorStore.subscribe = subscribeEditor;
useEditorStore.persist = useSchemeStore.persist;
useEditorStore.hasHydrated = editorStoresHaveHydrated;

export { waitForEditorHydration, onEditorStoresHydrated } from '@/stores/editor-hydration';

bindEditorStores({
  getScheme: () => {
    const { scheme, activePackKey, schemesByPack, snapshot } = useSchemeStore.getState();
    return { scheme, activePackKey, schemesByPack, snapshot };
  },
  setScheme: (patch) => {
    const current = {
      scheme: useSchemeStore.getState().scheme,
      activePackKey: useSchemeStore.getState().activePackKey,
      schemesByPack: useSchemeStore.getState().schemesByPack,
      snapshot: useSchemeStore.getState().snapshot,
    };
    const resolved = typeof patch === 'function' ? patch(current) : patch;
    useSchemeStore.setState(resolved);
  },
  getFlow: () => {
    const { flowsByPack, flowResult, flowComputeState } = useFlowStore.getState();
    return { flowsByPack, flowResult, flowComputeState };
  },
  setFlow: (patch) => {
    const current = {
      flowsByPack: useFlowStore.getState().flowsByPack,
      flowResult: useFlowStore.getState().flowResult,
      flowComputeState: useFlowStore.getState().flowComputeState,
    };
    const resolved = typeof patch === 'function' ? patch(current) : patch;
    useFlowStore.setState(resolved);
  },
});

initFlowComputeRuntime();
