import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { installChromeShim } from '../../utils/chromeShim';
import { readByArea } from '../../utils/storageAccess';
import { Colors } from '../../../Constants';
import LabelForm from './LabelForm';

const seed = (key, value) => window.localStorage.setItem(key, JSON.stringify(value));
// Read back through the area router rather than chrome.storage.local directly:
// `labels` lives in chrome.storage.sync now, so a hardcoded local read would
// come back empty no matter what the component wrote.
const get = (keys) => new Promise((resolve) => readByArea(keys, resolve));

describe('LabelForm', () => {
  beforeEach(() => {
    window.localStorage.clear();
    delete globalThis.chrome;
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  // submitting a new title writes a label with a derived color and position
  it('writes a new label with derived backgroundColor and position', async () => {
    installChromeShim();
    render(<LabelForm />);

    await userEvent.type(screen.getByPlaceholderText('Group Title'), 'Work');
    await userEvent.click(screen.getByText('Create group'));

    await waitFor(async () => {
      const { labels } = await get('labels');
      expect(labels.Work).toBeDefined();
      // default color = Colors[title.length % Colors.length]
      expect(labels.Work.backgroundColor).toBe(Colors['Work'.length % Colors.length]);
      // first label → position is -(number of existing keys), i.e. zero
      expect(labels.Work.position === 0).toBe(true);
      expect(labels.Work.urlKeys).toEqual([]);
    });
  });

  // editing an existing label renames it, deleting the old map key and keeping urlKeys
  it('renames an existing label, deleting the old key', async () => {
    seed('labels', {
      Work: { title: 'Work', backgroundColor: '#1873E4', position: 0, urlKeys: ['url-a'] }
    });
    installChromeShim();
    render(<LabelForm label={{ title: 'Work', backgroundColor: '#1873E4' }} />);

    // the custom-color affordance is a labeled pill, not a bare swatch
    expect(screen.getByText('Custom')).toBeDefined();

    const input = screen.getByPlaceholderText('Group Title');
    await userEvent.clear(input);
    await userEvent.type(input, 'Office');
    await userEvent.click(screen.getByText('Save'));

    await waitFor(async () => {
      const { labels } = await get('labels');
      expect(labels.Work).toBeUndefined();
      expect(labels.Office).toBeDefined();
      // carried-over data is preserved through the rename
      expect(labels.Office.urlKeys).toEqual(['url-a']);
      expect(labels.Office.backgroundColor).toBe('#1873E4');
    });
  });

  // picking a swatch reports the pending appearance so the card behind can preview it
  it('reports a picked swatch through onPreview with the current title', async () => {
    installChromeShim();
    const previews = [];
    render(
      <LabelForm
        label={{ title: 'Work', backgroundColor: '#1873E4' }}
        onPreview={(pending) => previews.push(pending)}
      />
    );

    await userEvent.click(screen.getByLabelText(`Use color ${Colors[6]}`));

    await waitFor(() => {
      expect(previews[previews.length - 1]).toEqual({ title: 'Work', backgroundColor: Colors[6] });
    });
  });

  // typing reports too, so the card header tracks the pending name alongside the color
  it('reports a retyped title through onPreview', async () => {
    installChromeShim();
    const previews = [];
    render(
      <LabelForm
        label={{ title: 'Work', backgroundColor: '#1873E4' }}
        onPreview={(pending) => previews.push(pending)}
      />
    );

    const input = screen.getByPlaceholderText('Group Title');
    await userEvent.clear(input);
    await userEvent.type(input, 'Deep');

    await waitFor(() => {
      expect(previews[previews.length - 1]).toEqual({ title: 'Deep', backgroundColor: '#1873E4' });
    });
  });

  // saving hands back the committed values so the card can promote them without
  // repainting the old color in the gap before storage re-renders it
  it('reports the committed values through onSaved on submit', async () => {
    installChromeShim();
    const saved = [];
    render(
      <LabelForm
        label={{ title: 'Work', backgroundColor: '#1873E4' }}
        onSaved={(committed) => saved.push(committed)}
      />
    );

    await userEvent.click(screen.getByLabelText(`Use color ${Colors[5]}`));
    await userEvent.click(screen.getByText('Save'));

    await waitFor(() => {
      expect(saved).toEqual([{ title: 'Work', backgroundColor: Colors[5] }]);
    });
  });

  // with no swatch picked the saved color is the length-derived one, matching
  // what actually lands in storage rather than the previously committed color
  it('reports the length-derived color through onSaved when no swatch was picked', async () => {
    installChromeShim();
    const saved = [];
    render(<LabelForm onSaved={(committed) => saved.push(committed)} />);

    await userEvent.type(screen.getByPlaceholderText('Group Title'), 'Work');
    await userEvent.click(screen.getByText('Create group'));

    await waitFor(async () => {
      const { labels } = await get('labels');
      expect(saved).toEqual([
        { title: 'Work', backgroundColor: Colors['Work'.length % Colors.length] }
      ]);
      // the reported color is the one that was actually written, not a re-derivation
      expect(saved[0].backgroundColor).toBe(labels.Work.backgroundColor);
    });
  });
});
