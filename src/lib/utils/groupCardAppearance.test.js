import { describe, it, expect } from 'vitest';
import groupCardAppearance from './groupCardAppearance';

// The committed state of a card whose group is named Work and colored blue.
const COMMITTED = {
  previewTitle: null,
  previewBackgroundColor: null,
  currentTitle: 'Work',
  currentBackgroundColor: '#2f7de1',
  title: 'Work'
};

describe('groupCardAppearance', () => {
  // no edit in flight: the card paints exactly what storage committed
  it('uses the committed values when no preview is pending', () => {
    expect(groupCardAppearance(COMMITTED))
      .toEqual({ color: '#2f7de1', titleText: 'Work' });
  });

  // a swatch was clicked but not saved: the pending color wins over the committed one
  it('prefers a pending color over the committed color', () => {
    expect(groupCardAppearance({ ...COMMITTED, previewBackgroundColor: '#7c3aed' }))
      .toEqual({ color: '#7c3aed', titleText: 'Work' });
  });

  // the name was retyped alongside a recolor: both pending values show together
  it('prefers a pending title and color together', () => {
    expect(groupCardAppearance({
      ...COMMITTED,
      previewTitle: 'Deep Work',
      previewBackgroundColor: '#d8352a'
    })).toEqual({ color: '#d8352a', titleText: 'Deep Work' });
  });

  // the revert guarantee: clearing the preview is the whole of cancel, so nulls
  // must land back on the committed appearance rather than on undefined
  it('reverts to the committed appearance when the preview is cleared', () => {
    const previewing = { ...COMMITTED, previewTitle: 'Deep Work', previewBackgroundColor: '#d8352a' };
    expect(groupCardAppearance({ ...previewing, previewTitle: null, previewBackgroundColor: null }))
      .toEqual(groupCardAppearance(COMMITTED));
  });

  // an emptied name field must not blank the header — '' falls through the chain
  it('falls back to the committed title when the pending title is empty', () => {
    expect(groupCardAppearance({ ...COMMITTED, previewTitle: '' }).titleText).toBe('Work');
  });

  // a card whose committed title has not loaded yet still shows its mount-time prop
  it('falls back to the mounted title prop when the committed title is absent', () => {
    expect(groupCardAppearance({ ...COMMITTED, currentTitle: null, previewTitle: '' }).titleText)
      .toBe('Work');
  });

  // a renamed group: the committed title is what a rename updated, not the prop
  it('prefers the committed title over the mounted title prop', () => {
    expect(groupCardAppearance({ ...COMMITTED, currentTitle: 'Renamed' }).titleText)
      .toBe('Renamed');
  });

  // a group with no color at all yields an undefined color, which the caller
  // turns into the neutral default — the helper must not invent a color itself
  it('returns an undefined color when neither a pending nor committed color exists', () => {
    expect(groupCardAppearance({ ...COMMITTED, currentBackgroundColor: undefined }).color)
      .toBeUndefined();
  });

  // called with nothing at all it must not throw — every field is optional
  it('tolerates being called with no argument', () => {
    expect(groupCardAppearance()).toEqual({ color: undefined, titleText: undefined });
  });
});
