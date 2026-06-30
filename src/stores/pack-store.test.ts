import { describe, expect, it, beforeEach } from 'vitest';
import { usePackStore } from '@/stores/pack-store';

describe('pack-store', () => {
  beforeEach(() => {
    usePackStore.setState({
      activePack: null,
      activeEntry: null,
      error: null,
      manifest: [],
      loading: false,
    });
  });

  it('starts with no active pack', () => {
    expect(usePackStore.getState().activePack).toBeNull();
  });
});
