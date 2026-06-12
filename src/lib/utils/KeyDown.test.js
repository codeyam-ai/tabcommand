import { describe, it, expect, beforeEach, vi } from 'vitest';
import KeyDown from './KeyDown';

describe('KeyDown', () => {
  beforeEach(() => {
    // KeyDown is a module singleton with a shared subscriber list; reset it so
    // tests don't leak handlers into one another.
    KeyDown.functions.length = 0;
    document.onkeydown = null;
  });

  // trigger fans the event out to a subscriber added via add
  it('invokes an added subscriber with the event', () => {
    const fn = vi.fn();
    KeyDown.add(fn);
    KeyDown.trigger({ key: 'Escape' });
    expect(fn).toHaveBeenCalledWith({ key: 'Escape' });
  });

  // every subscriber fires on a single trigger
  it('invokes all subscribers', () => {
    const a = vi.fn();
    const b = vi.fn();
    KeyDown.add(a);
    KeyDown.add(b);
    KeyDown.trigger({ key: 'ArrowDown' });
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  // remove unsubscribes a handler so later triggers skip it
  it('stops invoking a removed subscriber', () => {
    const fn = vi.fn();
    KeyDown.add(fn);
    KeyDown.remove(fn);
    KeyDown.trigger({ key: 'a' });
    expect(fn).not.toHaveBeenCalled();
  });

  // removing a function that was never added is a harmless no-op
  it('tolerates removing an unknown function', () => {
    const fn = vi.fn();
    expect(() => KeyDown.remove(fn)).not.toThrow();
    expect(KeyDown.functions).toHaveLength(0);
  });

  // add wires document.onkeydown so a real keydown dispatches through trigger
  it('dispatches a real document keydown to subscribers', () => {
    const fn = vi.fn();
    KeyDown.add(fn);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'x' }));
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn.mock.calls[0][0].key).toBe('x');
  });

  // the Cmd+F focus path: the metaKey + key event is forwarded intact
  it('forwards a Cmd+F event to subscribers', () => {
    const fn = vi.fn();
    KeyDown.add(fn);
    KeyDown.trigger({ metaKey: true, key: 'f' });
    expect(fn).toHaveBeenCalledWith({ metaKey: true, key: 'f' });
  });
});
