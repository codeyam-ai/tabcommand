import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DragDropContext } from '@hello-pangea/dnd';
import { installChromeShim } from '../../utils/chromeShim';
import Labels from './Labels';

const seed = (key, value) => window.localStorage.setItem(key, JSON.stringify(value));

const renderLabels = () =>
  render(
    <DragDropContext onDragEnd={() => {}}>
      <Labels />
    </DragDropContext>
  );

describe('Labels', () => {
  beforeEach(() => {
    window.localStorage.clear();
    delete globalThis.chrome;
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  // every label in the map renders as a group card
  it('renders a group for each label', async () => {
    seed('labels', {
      Work: { title: 'Work', backgroundColor: '#1873E4', position: 0, urlKeys: [] },
      Reading: { title: 'Reading', backgroundColor: '#1F8E43', position: 1, urlKeys: [] }
    });
    installChromeShim();
    renderLabels();

    expect(await screen.findByText('Work')).toBeInTheDocument();
    expect(screen.getByText('Reading')).toBeInTheDocument();
  });

  // the uxSettings-selected label is pinned in the selected section, not the grid
  it('pins the selected label above the grid', async () => {
    seed('labels', {
      Work: { title: 'Work', backgroundColor: '#1873E4', position: 0, urlKeys: [] },
      Reading: { title: 'Reading', backgroundColor: '#1F8E43', position: 1, urlKeys: [] }
    });
    seed('uxSettings', { selectedLabel: 'Work' });
    installChromeShim();
    const { container } = renderLabels();

    await screen.findByText('Reading');

    const selected = container.querySelector('.LabelCollections-selected');
    expect(selected).toBeTruthy();
    expect(selected).toHaveTextContent('Work');
    // Work is pinned, so it is filtered out of the chunked grid rows
    const rows = container.querySelector('.LabelCollections-row');
    expect(rows).not.toHaveTextContent('Work');
  });

  // with no labels the empty-state guidance and the Add Group CTA are shown
  it('shows the empty-state CTA when there are no labels', async () => {
    installChromeShim();
    renderLabels();

    expect(await screen.findByText(/Click the "Add Group" icon above/i)).toBeInTheDocument();
    expect(screen.getByText('Add Group')).toBeInTheDocument();
  });

  // Regression: `labels` lives in chrome.storage.sync, and the two areas fire
  // SEPARATE onChanged events — one event carries only one area's keys. The
  // blanket `if (areaName !== 'local') return` preamble that used to stand in
  // this listener therefore dropped EVERY labels change. The grid never
  // re-rendered, so deleting a group wrote storage correctly and left the card
  // on screen: the entire user-visible "Delete Group does nothing" symptom.
  // Deleting is the only mutation that shows it, because a recolor or rename is
  // repainted by LabelCollection's own (already correct) listener.
  it('drops a deleted group from the grid on a sync-area labels change', async () => {
    seed('labels', {
      Work: { title: 'Work', backgroundColor: '#1873E4', position: 0, urlKeys: [] },
      Reading: { title: 'Reading', backgroundColor: '#1F8E43', position: 1, urlKeys: [] }
    });
    installChromeShim();
    renderLabels();

    await screen.findByText('Work');

    await act(async () => {
      globalThis.chrome.storage.sync.set({
        labels: {
          Reading: { title: 'Reading', backgroundColor: '#1F8E43', position: 1, urlKeys: [] }
        }
      });
    });

    await waitFor(() => expect(screen.queryByText('Work')).not.toBeInTheDocument());
    // the surviving group is still rendered — this is a targeted removal, not a wipe
    expect(screen.getByText('Reading')).toBeInTheDocument();
  });

  // The same path in the additive direction, and the one the live preview can
  // drive without a confirm() dialog: a newly created group appears immediately.
  it('adds a new group to the grid on a sync-area labels change', async () => {
    seed('labels', {
      Reading: { title: 'Reading', backgroundColor: '#1F8E43', position: 0, urlKeys: [] }
    });
    installChromeShim();
    renderLabels();

    await screen.findByText('Reading');

    await act(async () => {
      globalThis.chrome.storage.sync.set({
        labels: {
          Reading: { title: 'Reading', backgroundColor: '#1F8E43', position: 0, urlKeys: [] },
          Research: { title: 'Research', backgroundColor: '#cf9f1c', position: 1, urlKeys: [] }
        }
      });
    });

    expect(await screen.findByText('Research')).toBeInTheDocument();
  });
});
