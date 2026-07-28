import { describe, it, expect } from 'vitest';
import anchoredMenuCoords from './anchoredMenuCoords';

// A 205px-wide, 260px-tall menu in a 1000x800 viewport unless a case says otherwise.
const MENU = { width: 205, height: 260 };

const setViewport = (width, height) => {
  Object.defineProperty(window, 'innerWidth', { value: width, writable: true, configurable: true });
  Object.defineProperty(window, 'innerHeight', { value: height, writable: true, configurable: true });
};

describe('anchoredMenuCoords', () => {
  // a button with room below: the menu hangs under it with their right edges aligned
  it('right-aligns to the anchor and opens downward when there is room', () => {
    setViewport(1000, 800);
    expect(anchoredMenuCoords({ right: 500, top: 72, bottom: 100 }, MENU))
      .toEqual({ top: 106, left: 295 });
  });

  // the bottom-row case: no room below, so the menu opens upward from the anchor
  it('flips above the anchor when the menu would run off the bottom', () => {
    setViewport(1000, 800);
    expect(anchoredMenuCoords({ right: 500, top: 672, bottom: 700 }, MENU))
      .toEqual({ top: 406, left: 295 });
  });

  // an anchor at the right edge would push the menu off-screen, so it clamps
  it('clamps to the right viewport edge', () => {
    setViewport(1000, 800);
    expect(anchoredMenuCoords({ right: 995, top: 72, bottom: 100 }, MENU).left).toBe(787);
  });

  // an anchor near the left edge cannot pull the menu off the left side
  it('clamps to the left viewport edge', () => {
    setViewport(1000, 800);
    expect(anchoredMenuCoords({ right: 100, top: 72, bottom: 100 }, MENU).left).toBe(8);
  });

  // a menu taller than the space above still starts on screen rather than above it
  it('clamps a flipped menu to the top of the viewport', () => {
    setViewport(1000, 400);
    expect(anchoredMenuCoords({ right: 500, top: 50, bottom: 78 }, { width: 205, height: 600 }).top)
      .toBe(8);
  });

  // a menu that exactly fills the space below stays below rather than flipping
  it('keeps the menu below when it fits with no room to spare', () => {
    setViewport(1000, 800);
    // bottom 526 + gap 6 + height 260 = 792, exactly the 800 - 8 margin
    expect(anchoredMenuCoords({ right: 500, top: 498, bottom: 526 }, MENU).top).toBe(532);
  });

  // one more pixel of menu than fits below tips it over into flipping up
  it('flips as soon as the menu overshoots the bottom margin by a pixel', () => {
    setViewport(1000, 800);
    expect(anchoredMenuCoords({ right: 500, top: 499, bottom: 527 }, MENU).top).toBe(233);
  });

  // margin and gap are tunable rather than baked in
  it('honors custom margin and gap overrides', () => {
    setViewport(1000, 800);
    expect(anchoredMenuCoords({ right: 500, top: 72, bottom: 100 }, { ...MENU, margin: 20, gap: 0 }))
      .toEqual({ top: 100, left: 295 });
  });
});
