import type { TfgpFile } from '@/schema/tfgp';
import type { FlowResult } from '@/calculator/flow-solver';

const EDITOR_STORE_KEY = 'tfg-editor-store';

export interface PersistedPackFlowCache {
  revision: string;
  flowResult: FlowResult;
}

export interface PersistedEditorSnapshot {
  activePackKey: string | null;
  schemesByPack: Record<string, TfgpFile>;
  scheme: TfgpFile | null;
  flowsByPack: Record<string, PersistedPackFlowCache>;
}

/** Sync read before zustand persist finishes — keeps scheme on F5. */
export function readPersistedEditorSnapshot(): PersistedEditorSnapshot {
  if (typeof localStorage === 'undefined') {
    return { activePackKey: null, schemesByPack: {}, scheme: null, flowsByPack: {} };
  }
  try {
    const raw = localStorage.getItem(EDITOR_STORE_KEY);
    if (!raw) return { activePackKey: null, schemesByPack: {}, scheme: null, flowsByPack: {} };
    const parsed = JSON.parse(raw) as {
      state?: {
        activePackKey?: string | null;
        schemesByPack?: Record<string, TfgpFile>;
        flowsByPack?: Record<string, PersistedPackFlowCache>;
      };
    };
    const schemesByPack = parsed.state?.schemesByPack ?? {};
    const flowsByPack = parsed.state?.flowsByPack ?? {};
    const activePackKey = parsed.state?.activePackKey ?? null;
    const scheme =
      activePackKey && schemesByPack[activePackKey]
        ? schemesByPack[activePackKey]
        : null;
    return { activePackKey, schemesByPack, scheme, flowsByPack };
  } catch {
    return { activePackKey: null, schemesByPack: {}, scheme: null, flowsByPack: {} };
  }
}
