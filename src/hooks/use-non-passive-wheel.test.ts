import { describe, expect, it, vi } from 'vitest';
import { bindNonPassiveWheel } from '@/hooks/use-non-passive-wheel';

describe('bindNonPassiveWheel', () => {
  it('registers wheel listener with passive false', () => {
    const el = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as HTMLElement;

    const unbind = bindNonPassiveWheel(el, () => {});
    expect(el.addEventListener).toHaveBeenCalledWith('wheel', expect.any(Function), {
      passive: false,
    });

    unbind();
    expect(el.removeEventListener).toHaveBeenCalledWith('wheel', expect.any(Function));
  });

  it('forwards wheel events to handler', () => {
    let handlerCalled = false;
    const el = {
      addEventListener: vi.fn((_type, listener: EventListener) => {
        const event = {
          deltaY: 120,
          preventDefault: vi.fn(),
          stopPropagation: vi.fn(),
        } as unknown as WheelEvent;
        listener(event);
      }),
      removeEventListener: vi.fn(),
    } as unknown as HTMLElement;

    bindNonPassiveWheel(el, (event) => {
      handlerCalled = true;
      event.preventDefault();
      event.stopPropagation();
    });

    expect(handlerCalled).toBe(true);
    expect(el.addEventListener).toHaveBeenCalledOnce();
  });
});
