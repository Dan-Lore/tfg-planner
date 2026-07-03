import { createJSONStorage, type StateStorage } from 'zustand/middleware';
import type { TfgpFile } from '@/schema/tfgp';
import type { PersistedPackFlowCache } from '@/lib/editor-persist';

const EDITOR_STORE_KEY = 'tfg-editor-store';

type PersistedEditorState = {
  schemesByPack?: Record<string, TfgpFile>;
  activePackKey?: string | null;
  flowsByPack?: Record<string, PersistedPackFlowCache>;
};

function readPersistedState(): PersistedEditorState {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(EDITOR_STORE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as { state?: PersistedEditorState };
    return parsed.state ?? {};
  } catch {
    return {};
  }
}

function writePersistedState(patch: PersistedEditorState): void {
  if (typeof localStorage === 'undefined') return;
  const merged = { ...readPersistedState(), ...patch };
  localStorage.setItem(
    EDITOR_STORE_KEY,
    JSON.stringify({ state: merged, version: 0 }),
  );
}

/** Merges slice writes into the shared tfg-editor-store localStorage key. */
export function createEditorSliceStorage<K extends keyof PersistedEditorState>(
  keys: readonly K[],
): StateStorage {
  return {
    getItem: () => {
      const merged = readPersistedState();
      const slice: Partial<PersistedEditorState> = {};
      for (const key of keys) {
        slice[key] = merged[key];
      }
      return JSON.stringify({ state: slice, version: 0 });
    },
    setItem: (_name, value) => {
      const parsed = JSON.parse(value) as { state?: PersistedEditorState };
      const slice = parsed.state ?? {};
      const patch: PersistedEditorState = {};
      for (const key of keys) {
        if (key in slice) {
          patch[key] = slice[key];
        }
      }
      writePersistedState(patch);
    },
    removeItem: () => {
      if (typeof localStorage === 'undefined') return;
      localStorage.removeItem(EDITOR_STORE_KEY);
    },
  };
}

export const schemePersistStorage = createJSONStorage(() =>
  createEditorSliceStorage(['schemesByPack', 'activePackKey']),
);

export const flowPersistStorage = createJSONStorage(() =>
  createEditorSliceStorage(['flowsByPack']),
);

export function mergePersistedEditorState(
  persisted: unknown,
  current: PersistedEditorState,
): PersistedEditorState {
  const p = persisted as PersistedEditorState | undefined;
  if (!p) return current;

  const pSchemes = p.schemesByPack ?? {};
  const cSchemes = current.schemesByPack ?? {};
  let schemesByPack = cSchemes;
  if (!(Object.keys(pSchemes).length === 0 && Object.keys(cSchemes).length > 0)) {
    schemesByPack =
      Object.keys(pSchemes).length >= Object.keys(cSchemes).length
        ? { ...cSchemes, ...pSchemes }
        : { ...pSchemes, ...cSchemes };
  }

  const pFlows = p.flowsByPack ?? {};
  const cFlows = current.flowsByPack ?? {};
  const flowsByPack =
    Object.keys(pFlows).length >= Object.keys(cFlows).length
      ? { ...cFlows, ...pFlows }
      : { ...pFlows, ...cFlows };

  return {
    ...current,
    schemesByPack,
    flowsByPack,
    activePackKey: p.activePackKey ?? current.activePackKey,
  };
}
