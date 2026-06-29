import { useEffect, useRef } from 'react';
import { usePackStore } from '@/stores/pack-store';
import { scheduleEnsureActivePackReady } from '@/lib/restore-active-pack';

/** Load manifest and restore persisted pack. */
export function usePackBootstrap(): void {
  const loadManifestList = usePackStore((s) => s.loadManifestList);
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    scheduleEnsureActivePackReady('bootstrap');
    void loadManifestList();
  }, [loadManifestList]);
}
