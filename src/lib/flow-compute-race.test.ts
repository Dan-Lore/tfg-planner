import { describe, expect, it } from 'vitest';
import { shouldApplyFlowResult } from '@/lib/flow-compute-guard';
import { mergePendingFlowUpdateMode } from '@/lib/flow-compute-queue';

describe('flow compute race (integration scenario)', () => {
  it('discards stale worker result when scheme revision changed during compute', () => {
    const revisionAtStart = 'rev-a';
    const revisionAfterEdit = 'rev-b';
    expect(shouldApplyFlowResult(revisionAtStart, revisionAfterEdit)).toBe(false);
  });

  it('queues recalculate when update arrives during busy recalculate', () => {
    expect(mergePendingFlowUpdateMode('recalculate', 'update')).toBe('recalculate');
  });

  it('escalates pending update to recalculate', () => {
    expect(mergePendingFlowUpdateMode('update', 'recalculate')).toBe('recalculate');
  });

  it('keeps first pending mode when both are update', () => {
    expect(mergePendingFlowUpdateMode('update', 'update')).toBe('update');
  });

  it('accepts result when revision unchanged after compute', () => {
    expect(shouldApplyFlowResult('same-rev', 'same-rev')).toBe(true);
  });
});
