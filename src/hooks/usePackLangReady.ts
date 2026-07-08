import { useEffect, useState } from 'react';
import type { ActivePack } from '@/data/pack-runtime';
import { isPackRuntime } from '@/data/pack-runtime';

/** Re-render when lazy pack.lang artifact finishes loading. */
export function usePackLangReady(pack: ActivePack | null | undefined): boolean {
  const [ready, setReady] = useState(() =>
    pack && isPackRuntime(pack) ? pack.langReady : true,
  );

  useEffect(() => {
    if (!pack || !isPackRuntime(pack)) {
      setReady(true);
      return;
    }
    setReady(pack.langReady);
    return pack.onLangReady(() => setReady(true));
  }, [pack]);

  return ready;
}
