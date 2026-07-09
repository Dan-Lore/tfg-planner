import { describe, expect, it, vi } from 'vitest';
import { debounceFlowUpdate } from '@/editor-graph/debounce-flow-update';

describe('debounceFlowUpdate', () => {
  it('defaults to 500ms delay', async () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const debounced = debounceFlowUpdate(fn);
    debounced();
    expect(fn).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(499);
    expect(fn).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(fn).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
