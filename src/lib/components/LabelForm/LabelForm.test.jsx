import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { installChromeShim } from '../../utils/chromeShim';
import { Colors } from '../../../Constants';
import LabelForm from './LabelForm';

const seed = (key, value) => window.localStorage.setItem(key, JSON.stringify(value));
const get = (keys) => new Promise((resolve) => chrome.storage.local.get(keys, resolve));

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

    const input = screen.getByPlaceholderText('Group Title');
    await userEvent.clear(input);
    await userEvent.type(input, 'Office');
    await userEvent.click(screen.getByText('Create group'));

    await waitFor(async () => {
      const { labels } = await get('labels');
      expect(labels.Work).toBeUndefined();
      expect(labels.Office).toBeDefined();
      // carried-over data is preserved through the rename
      expect(labels.Office.urlKeys).toEqual(['url-a']);
      expect(labels.Office.backgroundColor).toBe('#1873E4');
    });
  });
});
