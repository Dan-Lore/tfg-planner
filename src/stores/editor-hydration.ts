import { useSchemeStore } from '@/stores/scheme-store';
import { useFlowStore } from '@/stores/flow-store';

type PersistApi = {
  hasHydrated: () => boolean;
  onFinishHydration: (fn: () => void) => () => void;
};

function waitForPersistHydration(persist: PersistApi): Promise<void> {
  if (persist.hasHydrated()) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      unsub();
      resolve();
    };
    const unsub = persist.onFinishHydration(done);
    if (persist.hasHydrated()) done();
  });
}

/** Wait until both scheme and flow persist slices have rehydrated from localStorage. */
export function waitForEditorHydration(): Promise<void> {
  return Promise.all([
    waitForPersistHydration(useSchemeStore.persist),
    waitForPersistHydration(useFlowStore.persist),
  ]).then(() => undefined);
}

/** Run once after both editor persist slices have finished rehydrating. */
export function onEditorStoresHydrated(fn: () => void): () => void {
  let schemeHydrated = useSchemeStore.persist.hasHydrated();
  let flowHydrated = useFlowStore.persist.hasHydrated();

  const tryRun = () => {
    if (schemeHydrated && flowHydrated) fn();
  };

  const unsubs: (() => void)[] = [];
  if (!schemeHydrated) {
    unsubs.push(
      useSchemeStore.persist.onFinishHydration(() => {
        schemeHydrated = true;
        tryRun();
      }),
    );
  }
  if (!flowHydrated) {
    unsubs.push(
      useFlowStore.persist.onFinishHydration(() => {
        flowHydrated = true;
        tryRun();
      }),
    );
  }
  tryRun();

  return () => {
    for (const unsub of unsubs) unsub();
  };
}

export function editorStoresHaveHydrated(): boolean {
  return useSchemeStore.persist.hasHydrated() && useFlowStore.persist.hasHydrated();
}
